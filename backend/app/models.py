from datetime import date, datetime
from enum import Enum
from typing import Annotated
from uuid import UUID, uuid4

from pydantic import EmailStr, StringConstraints, model_validator
from sqlalchemy import Column, DateTime
from sqlmodel import Field, SQLModel

Currency = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]


class User(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(unique=True, index=True)
    password_hash: str


class Credentials(SQLModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class UserRead(SQLModel):
    id: UUID
    email: str


class AuthSession(SQLModel, table=True):
    token_hash: str = Field(primary_key=True, max_length=64)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True)
    )


class SessionRead(UserRead):
    csrf_token: str


class AuthRateLimit(SQLModel, table=True):
    key: str = Field(primary_key=True, max_length=100)
    attempts: int
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True)
    )


class PaystubInput(SQLModel):
    employer: str = Field(min_length=1, max_length=200)
    pay_date: date
    gross_cents: int = Field(ge=0, le=10**12)
    deductions_cents: int = Field(ge=0, le=10**12)
    net_cents: int = Field(ge=0, le=10**12)
    currency: Currency = "CAD"

    @model_validator(mode="after")
    def amounts_match(self):
        if self.gross_cents - self.deductions_cents != self.net_cents:
            raise ValueError("Net pay must equal gross pay minus deductions")
        return self


class Paystub(PaystubInput, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)


class PaystubRead(PaystubInput):
    id: UUID


class PaymentStatus(str, Enum):
    pending = "pending"
    paid = "paid"


class PaymentInput(SQLModel):
    recipient: str = Field(min_length=1, max_length=200)
    category: str = Field(default="other", min_length=1, max_length=100)
    amount_cents: int = Field(gt=0, le=10**12)
    currency: Currency = "CAD"
    due_date: date
    status: PaymentStatus = PaymentStatus.pending
    paid_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_paid_date(self):
        if (self.status == PaymentStatus.paid) != (self.paid_date is not None):
            raise ValueError("Paid payments require paid_date; pending payments must omit it")
        return self


class Payment(PaymentInput, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)


class PaymentRead(PaymentInput):
    id: UUID
