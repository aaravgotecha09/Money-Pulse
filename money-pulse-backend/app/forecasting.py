"""Same model as the extension's shared.js, kept in one place so the backend
and the (offline-fallback) extension logic never drift apart."""


def project_balance(profile, days, extra_outflow=0, extra_outflow_day=0):
    daily_burn = profile.avg_monthly_expense / 30
    bal = profile.balance - daily_burn * days
    if profile.salary_in_days <= days:
        bal += profile.salary_amount
    if profile.rent_in_days <= days:
        bal -= profile.rent_amount
    if profile.emi_in_days <= days:
        bal -= profile.emi_amount
    if extra_outflow and extra_outflow_day <= days:
        bal -= extra_outflow
    return round(bal)


def stability_label(bal, daily_burn):
    reserve = daily_burn * 7
    if bal > reserve * 2:
        return "Stable"
    if bal > 0:
        return "Pressure"
    return "Critical"


def forecast(profile):
    daily_burn = profile.avg_monthly_expense / 30
    windows = []
    for d in (7, 14, 21):
        bal = project_balance(profile, d)
        windows.append({"day": d, "balance": bal, "label": stability_label(bal, daily_burn)})
    worst = windows[-1]
    if worst["balance"] < 0:
        shortage_probability = min(97, round(50 + (abs(worst["balance"]) / profile.avg_monthly_expense) * 50))
    else:
        shortage_probability = max(3, round(20 - (worst["balance"] / profile.avg_monthly_expense) * 15))
    expected_shortage = max(0, -worst["balance"])
    return {
        "windows": windows,
        "shortageProbability": shortage_probability,
        "expectedShortage": expected_shortage,
        "dailyBurn": daily_burn,
    }


def stress_index(profile):
    daily_burn = profile.avg_monthly_expense / 30
    income = profile.salary_amount or 1

    income_stability = 82 if profile.salary_amount > 0 else 40

    expense_ratio = profile.avg_monthly_expense / income
    expense_predictability = max(10, min(100, round(100 - expense_ratio * 60)))

    emergency_reserve = max(0, min(100, round((profile.balance / (profile.avg_monthly_expense * 3)) * 100)))

    debt_ratio = (profile.emi_amount + profile.rent_amount) / income
    debt_pressure = max(0, min(100, round(100 - debt_ratio * 100)))

    f = forecast(profile)
    label_score = {"Stable": 90, "Pressure": 55, "Critical": 20}
    cash_flow_stability = round(sum(label_score[w["label"]] for w in f["windows"]) / len(f["windows"]))

    overall = round(
        (income_stability + expense_predictability + emergency_reserve + debt_pressure + cash_flow_stability) / 5
    )

    return {
        "incomeStability": income_stability,
        "expensePredictability": expense_predictability,
        "emergencyReserve": emergency_reserve,
        "debtPressure": debt_pressure,
        "cashFlowStability": cash_flow_stability,
        "overall": overall,
    }


def balance_series(profile, days=21, extra_outflow=0, extra_outflow_day=0):
    series = []
    for d in range(days + 1):
        series.append({
            "day": d,
            "balance": project_balance(profile, d, extra_outflow, extra_outflow_day),
            "isSalary": profile.salary_in_days == d,
            "isRent": profile.rent_in_days == d,
            "isEmi": profile.emi_in_days == d,
        })
    return series


def what_if(profile, amount, buy_in_days=0):
    before = stress_index(profile)["overall"]
    daily_burn = profile.avg_monthly_expense / 30

    bal_after_now = project_balance(profile, 21, amount, buy_in_days)
    after_label = stability_label(bal_after_now, daily_burn)
    after_score_approx = max(5, before - round((amount / profile.avg_monthly_expense) * 22))

    if after_label == "Critical" or after_score_approx < 45:
        risk = "High"
    elif after_label == "Pressure" or after_score_approx < 65:
        risk = "Medium"
    else:
        risk = "Low"

    monthly_surplus = profile.salary_amount - profile.rent_amount - profile.emi_amount - profile.avg_monthly_expense
    balance_in_90_days = profile.balance + monthly_surplus * 3
    score_in_90_days = max(5, min(97, before + round((monthly_surplus * 3) / profile.avg_monthly_expense * 10)))
    after_wait_90 = max(5, score_in_90_days - round((amount / profile.avg_monthly_expense) * 22))

    if after_wait_90 < 45:
        risk_wait = "High"
    elif after_wait_90 < 65:
        risk_wait = "Medium"
    else:
        risk_wait = "Low"

    months_to_save = max(1, -(-amount // monthly_surplus)) if monthly_surplus > 0 else None  # ceil div
    suggested_monthly = round(amount / min(months_to_save, 6)) if months_to_save else None

    return {
        "before": before,
        "afterNow": {"score": after_score_approx, "risk": risk, "projectedBalance": bal_after_now},
        "afterWait90": {"score": after_wait_90, "risk": risk_wait, "projectedBalance": balance_in_90_days},
        "saveUp": {
            "months": min(months_to_save, 6) if months_to_save else 6,
            "monthlyAmount": suggested_monthly,
        },
    }
