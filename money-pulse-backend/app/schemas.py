from typing import Optional, List
from pydantic import BaseModel


class ProfileSchema(BaseModel):
    balance: float
    salaryAmount: float
    salaryInDays: int
    rentAmount: float
    rentInDays: int
    emiAmount: float
    emiInDays: int
    avgMonthlyExpense: float

    class Config:
        from_attributes = True


class UserOut(BaseModel):
    id: int
    email: str
    name: Optional[str]
    picture: Optional[str]

    class Config:
        from_attributes = True


class WhatIfIn(BaseModel):
    amount: float
    buyInDays: int = 0


class WhatIfState(BaseModel):
    score: int
    risk: str
    projectedBalance: float


class WhatIfOut(BaseModel):
    before: int
    afterNow: WhatIfState
    afterWait90: WhatIfState
    saveUp: dict


class ForecastWindow(BaseModel):
    day: int
    balance: float
    label: str


class ForecastOut(BaseModel):
    windows: List[ForecastWindow]
    shortageProbability: int
    expectedShortage: float
    stressIndex: dict
    series: List[dict]


class TrackedItemIn(BaseModel):
    url: str
    title: str
    amount: float


class TrackedItemOut(TrackedItemIn):
    id: int
    addedAt: float

    class Config:
        from_attributes = True


class HistoryEntryIn(BaseModel):
    amount: float
    days: int = 0
    risk: str
    score: int
    combined: Optional[int] = None


class HistoryEntryOut(HistoryEntryIn):
    id: int
    at: float

    class Config:
        from_attributes = True
