from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response
from sqlmodel import select

from app.auth import UserDep
from app.db import SessionDep
from app.models import Payment, PaymentInput, PaymentRead, Paystub, PaystubInput, PaystubRead

router = APIRouter()
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


def owned_record(model, record_id: UUID, session, user):
    record = session.exec(
        select(model).where(model.id == record_id, model.user_id == user.id)
    ).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


@router.get("/paystubs", response_model=list[PaystubRead], tags=["paystubs"])
def list_paystubs(session: SessionDep, user: UserDep, limit: Limit = 50, offset: Offset = 0):
    return session.exec(
        select(Paystub)
        .where(Paystub.user_id == user.id)
        .order_by(Paystub.pay_date.desc(), Paystub.id)
        .offset(offset)
        .limit(limit)
    ).all()


@router.post("/paystubs", response_model=PaystubRead, status_code=201, tags=["paystubs"])
def create_paystub(data: PaystubInput, session: SessionDep, user: UserDep):
    record = Paystub(**data.model_dump(), user_id=user.id)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.get("/paystubs/{record_id}", response_model=PaystubRead, tags=["paystubs"])
def get_paystub(record_id: UUID, session: SessionDep, user: UserDep):
    return owned_record(Paystub, record_id, session, user)


@router.put("/paystubs/{record_id}", response_model=PaystubRead, tags=["paystubs"])
def update_paystub(record_id: UUID, data: PaystubInput, session: SessionDep, user: UserDep):
    record = owned_record(Paystub, record_id, session, user)
    record.sqlmodel_update(data.model_dump())
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.delete("/paystubs/{record_id}", status_code=204, tags=["paystubs"])
def delete_paystub(record_id: UUID, session: SessionDep, user: UserDep):
    session.delete(owned_record(Paystub, record_id, session, user))
    session.commit()
    return Response(status_code=204)


@router.get("/payments", response_model=list[PaymentRead], tags=["payments"])
def list_payments(session: SessionDep, user: UserDep, limit: Limit = 50, offset: Offset = 0):
    return session.exec(
        select(Payment)
        .where(Payment.user_id == user.id)
        .order_by(Payment.due_date.desc(), Payment.id)
        .offset(offset)
        .limit(limit)
    ).all()


@router.post("/payments", response_model=PaymentRead, status_code=201, tags=["payments"])
def create_payment(data: PaymentInput, session: SessionDep, user: UserDep):
    record = Payment(**data.model_dump(), user_id=user.id)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.get("/payments/{record_id}", response_model=PaymentRead, tags=["payments"])
def get_payment(record_id: UUID, session: SessionDep, user: UserDep):
    return owned_record(Payment, record_id, session, user)


@router.put("/payments/{record_id}", response_model=PaymentRead, tags=["payments"])
def update_payment(record_id: UUID, data: PaymentInput, session: SessionDep, user: UserDep):
    record = owned_record(Payment, record_id, session, user)
    record.sqlmodel_update(data.model_dump())
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.delete("/payments/{record_id}", status_code=204, tags=["payments"])
def delete_payment(record_id: UUID, session: SessionDep, user: UserDep):
    session.delete(owned_record(Payment, record_id, session, user))
    session.commit()
    return Response(status_code=204)
