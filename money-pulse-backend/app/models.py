import time
from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    google_sub = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    picture = Column(String, nullable=True)
    created_at = Column(Float, default=time.time)

    profile = relationship("FinancialProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    tracked_items = relationship("TrackedItem", back_populates="user", cascade="all, delete-orphan")
    history = relationship("HistoryEntry", back_populates="user", cascade="all, delete-orphan")


class FinancialProfile(Base):
    __tablename__ = "financial_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)

    balance = Column(Float, default=38000)
    salary_amount = Column(Float, default=45000)
    salary_in_days = Column(Integer, default=9)
    rent_amount = Column(Float, default=15000)
    rent_in_days = Column(Integer, default=3)
    emi_amount = Column(Float, default=8000)
    emi_in_days = Column(Integer, default=12)
    avg_monthly_expense = Column(Float, default=18000)
    updated_at = Column(Float, default=time.time)

    user = relationship("User", back_populates="profile")


class TrackedItem(Base):
    __tablename__ = "tracked_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    url = Column(String, nullable=False)
    title = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    added_at = Column(Float, default=time.time)

    user = relationship("User", back_populates="tracked_items")


class HistoryEntry(Base):
    __tablename__ = "history_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Float, nullable=False)
    days = Column(Integer, default=0)
    risk = Column(String, nullable=False)
    score = Column(Integer, nullable=False)
    combined_items = Column(Integer, nullable=True)
    at = Column(Float, default=time.time)

    user = relationship("User", back_populates="history")
