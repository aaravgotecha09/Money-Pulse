import os
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from . import models, schemas, auth, forecasting

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Money Pulse API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # extension calls bypass CORS via host_permissions; wide open for local dev/testing too
    allow_methods=["*"],
    allow_headers=["*"],
)

EXTENSION_ID = os.getenv("EXTENSION_ID", "")


@app.get("/")
def health():
    """Open this in a browser after deploying to confirm the server is up."""
    return {
        "status": "ok",
        "service": "Money Pulse API",
        "googleConfigured": bool(auth.GOOGLE_CLIENT_ID and auth.GOOGLE_CLIENT_SECRET),
        "baseUrl": auth.BASE_URL,
    }


# ---------- Auth ----------

@app.get("/auth/google/login")
def google_login():
    if not auth.GOOGLE_CLIENT_ID:
        raise HTTPException(500, "GOOGLE_CLIENT_ID is not set on the server (.env)")
    return RedirectResponse(auth.build_google_login_url())


@app.get("/auth/google/callback")
def google_callback(code: str, db: Session = Depends(get_db)):
    userinfo = auth.exchange_code_for_userinfo(code)
    sub = userinfo["sub"]
    email = userinfo.get("email", "")
    name = userinfo.get("name")
    picture = userinfo.get("picture")

    user = db.query(models.User).filter(models.User.google_sub == sub).first()
    if not user:
        user = models.User(google_sub=sub, email=email, name=name, picture=picture)
        db.add(user)
        db.commit()
        db.refresh(user)
        db.add(models.FinancialProfile(user_id=user.id))
        db.commit()

    token = auth.create_jwt(user.id)
    return RedirectResponse(f"/auth/success#token={token}")


@app.get("/auth/success", response_class=HTMLResponse)
def auth_success():
    # The extension's auth-bridge content script reads the #token fragment from
    # this page's URL and stores it — this page never sees the token itself
    # go anywhere except into the extension's own storage.
    return """
    <html><body style="background:#0B1220;color:#E7ECF3;font-family:sans-serif;
    display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
      <div style="text-align:center;">
        <h2>Signed in ✓</h2>
        <p>You can close this tab and go back to Money Pulse.</p>
      </div>
    </body></html>
    """


@app.get("/api/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(auth.get_current_user)):
    return user


# ---------- Profile ----------

def _profile_to_schema(p: models.FinancialProfile) -> schemas.ProfileSchema:
    return schemas.ProfileSchema(
        balance=p.balance, salaryAmount=p.salary_amount, salaryInDays=p.salary_in_days,
        rentAmount=p.rent_amount, rentInDays=p.rent_in_days, emiAmount=p.emi_amount,
        emiInDays=p.emi_in_days, avgMonthlyExpense=p.avg_monthly_expense,
    )


@app.get("/api/profile", response_model=schemas.ProfileSchema)
def get_profile(user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    profile = db.query(models.FinancialProfile).filter(models.FinancialProfile.user_id == user.id).first()
    if not profile:
        profile = models.FinancialProfile(user_id=user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return _profile_to_schema(profile)


@app.put("/api/profile", response_model=schemas.ProfileSchema)
def update_profile(body: schemas.ProfileSchema, user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    profile = db.query(models.FinancialProfile).filter(models.FinancialProfile.user_id == user.id).first()
    if not profile:
        profile = models.FinancialProfile(user_id=user.id)
        db.add(profile)

    profile.balance = body.balance
    profile.salary_amount = body.salaryAmount
    profile.salary_in_days = body.salaryInDays
    profile.rent_amount = body.rentAmount
    profile.rent_in_days = body.rentInDays
    profile.emi_amount = body.emiAmount
    profile.emi_in_days = body.emiInDays
    profile.avg_monthly_expense = body.avgMonthlyExpense
    db.commit()
    db.refresh(profile)
    return _profile_to_schema(profile)


def _get_or_create_profile(user: models.User, db: Session) -> models.FinancialProfile:
    profile = db.query(models.FinancialProfile).filter(models.FinancialProfile.user_id == user.id).first()
    if not profile:
        profile = models.FinancialProfile(user_id=user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


# ---------- Forecast ----------

@app.get("/api/forecast", response_model=schemas.ForecastOut)
def get_forecast(user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    profile = _get_or_create_profile(user, db)
    f = forecasting.forecast(profile)
    s = forecasting.stress_index(profile)
    series = forecasting.balance_series(profile, 21)
    return schemas.ForecastOut(
        windows=f["windows"], shortageProbability=f["shortageProbability"],
        expectedShortage=f["expectedShortage"], stressIndex=s, series=series,
    )


# ---------- What-if ----------

@app.post("/api/whatif", response_model=schemas.WhatIfOut)
def post_whatif(body: schemas.WhatIfIn, user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    profile = _get_or_create_profile(user, db)
    result = forecasting.what_if(profile, body.amount, body.buyInDays)
    return result


# ---------- Tracked items ----------

@app.get("/api/tracked", response_model=list[schemas.TrackedItemOut])
def list_tracked(user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    items = db.query(models.TrackedItem).filter(models.TrackedItem.user_id == user.id).order_by(models.TrackedItem.added_at.desc()).all()
    return [schemas.TrackedItemOut(id=i.id, url=i.url, title=i.title, amount=i.amount, addedAt=i.added_at) for i in items]


@app.post("/api/tracked", response_model=schemas.TrackedItemOut)
def add_tracked(body: schemas.TrackedItemIn, user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    existing = db.query(models.TrackedItem).filter(models.TrackedItem.user_id == user.id, models.TrackedItem.url == body.url).first()
    if existing:
        return schemas.TrackedItemOut(id=existing.id, url=existing.url, title=existing.title, amount=existing.amount, addedAt=existing.added_at)
    item = models.TrackedItem(user_id=user.id, url=body.url, title=body.title, amount=body.amount)
    db.add(item)
    db.commit()
    db.refresh(item)
    return schemas.TrackedItemOut(id=item.id, url=item.url, title=item.title, amount=item.amount, addedAt=item.added_at)


@app.delete("/api/tracked/{item_id}")
def remove_tracked(item_id: int, user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    item = db.query(models.TrackedItem).filter(models.TrackedItem.id == item_id, models.TrackedItem.user_id == user.id).first()
    if item:
        db.delete(item)
        db.commit()
    return {"ok": True}


@app.delete("/api/tracked")
def clear_tracked(user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db.query(models.TrackedItem).filter(models.TrackedItem.user_id == user.id).delete()
    db.commit()
    return {"ok": True}


# ---------- History ----------

@app.get("/api/history", response_model=list[schemas.HistoryEntryOut])
def list_history(user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    items = db.query(models.HistoryEntry).filter(models.HistoryEntry.user_id == user.id).order_by(models.HistoryEntry.at.desc()).limit(8).all()
    return [schemas.HistoryEntryOut(id=i.id, amount=i.amount, days=i.days, risk=i.risk, score=i.score, combined=i.combined_items, at=i.at) for i in items]


@app.post("/api/history", response_model=schemas.HistoryEntryOut)
def add_history(body: schemas.HistoryEntryIn, user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    entry = models.HistoryEntry(
        user_id=user.id, amount=body.amount, days=body.days, risk=body.risk,
        score=body.score, combined_items=body.combined,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return schemas.HistoryEntryOut(id=entry.id, amount=entry.amount, days=entry.days, risk=entry.risk, score=entry.score, combined=entry.combined_items, at=entry.at)


@app.delete("/api/history")
def clear_history(user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db.query(models.HistoryEntry).filter(models.HistoryEntry.user_id == user.id).delete()
    db.commit()
    return {"ok": True}
