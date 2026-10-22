# The Goal of create_group
# To take your group request, save the new group, automatically make you (the creator) the admin, save all the group members, and return the final created details.

# Example
# Imagine you (logged in as John) send this request:

# Group Name: "Weekend Trip"

# Members: Alice, Bob

# What this function does behind the scenes:

# Creates the group: Saves "Weekend Trip" in your database and gets a unique ID for it.

# Assigns you as Admin: Records in the database that John is an admin of "Weekend Trip".

# Saves the members: Adds Alice and Bob into the database linked to this specific group.

# Returns the result: Sends back the confirmation with the new group ID, name, and saved members.


# GOAL OF get_authenticated_user
# To verify who is making the request by checking their digital ID pass (token) with Supabase, and returning their unique user ID.
# Example
# With a valid token: You send a request with your login pass ("Bearer abc123xyz"). This function checks with Supabase to confirm it is real, retrieves your user ID, and passes it to the app so it knows who is creating the group.

# With a fake or expired token: The function stops you right at the door and blocks the request with an error saying you are unauthorized.


# get_group_or_404: What it does: Checks if a group actually exists in the database before doing any heavy lifting.If someone types a random ID in the URL like /groups/999/expenses, this function queries the database for group 999. If it finds nothing, it immediately stops the request and returns a 404 Not Found error.

# require_group_admin: What it does: Blocks regular members and outsiders, making sure only a designated admin can perform a specific action (like recording an expense).John is an admin of the "Weekend Trip" group. Belema is logged in, but she is either not in the group or just a regular member. When Belema tries to record an expense, this function blocks her with a 403 Forbidden error.


# require_group_membership: What it does: Checks if a user belongs to the group in any capacity (either as an admin or a regular member) to let them view or participate. If Belema wants to view the list of expenses for the "Weekend Trip" group, this function checks her membership. Since she belongs to the group, she passes through successfully. If she is an outsider, she gets blocked with a 403 Forbidden error.



# main.py

# main.py

import logging
import os
from datetime import datetime, timezone
from uuid import UUID

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import SQLAlchemyError

from database import engine
from schemas import (
    GroupCreateRequest,
    GroupCreateResponse,
    ExpenseCreateRequest,
    ExpenseCreateResponse,
)
from settlement import (
    calculate_fair_shares,
    calculate_balances,
    simplify_debts,
    compute_expense_fingerprint,
)

load_dotenv()
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Expense Sharing Engine API",
    description=(
        "API for creating expense-sharing groups, recording expenses, "
        "calculating settlements, and viewing expense history."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ---------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------

def get_authenticated_user(
    authorization: str | None = Header(default=None),
) -> UUID:
    """Validate a Supabase access token and return its user ID."""

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid Bearer access token is required.",
        )

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication is not configured.",
        )

    try:
        response = httpx.get(
            f"{supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": supabase_key,
                "Authorization": authorization,
            },
            timeout=5.0,
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is temporarily unavailable.",
        )

    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your access token is invalid or expired.",
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify your identity.",
        )

    try:
        return UUID(response.json()["id"])
    except (ValueError, KeyError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify your identity.",
        )


# ---------------------------------------------------------------------
# Shared authorization helpers
# ---------------------------------------------------------------------

def get_group_or_404(connection: Connection, group_id: UUID) -> None:
    """Stop the request early if the group does not exist."""
    group = connection.execute(
        text("SELECT id FROM public.groups WHERE id = :group_id"),
        {"group_id": group_id},
    ).first()

    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )


def require_group_admin(
    connection: Connection, group_id: UUID, user_id: UUID
) -> None:
    """Only an admin of this group may continue."""
    membership = connection.execute(
        text("""
            SELECT role FROM public.group_memberships
            WHERE group_id = :group_id AND user_id = :user_id
        """),
        {"group_id": group_id, "user_id": user_id},
    ).mappings().first()

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this group.",
        )

    if membership["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a group admin can record an expense.",
        )


def require_group_membership(
    connection: Connection, group_id: UUID, user_id: UUID
) -> None:
    """Any member (admin or regular) of this group may continue."""
    membership = connection.execute(
        text("""
            SELECT role FROM public.group_memberships
            WHERE group_id = :group_id AND user_id = :user_id
        """),
        {"group_id": group_id, "user_id": user_id},
    ).first()

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this group.",
        )


def block_if_duplicate_expense(
    connection: Connection,
    group_id: UUID,
    request_hash: str,
    window_seconds: int = 60,
) -> None:
    """
    Block this request if an identical one was made less than
    `window_seconds` ago. Otherwise, record this request and continue.

    Example:
        00:00:00 - John submits {total: 10000, John:6000, Belema:4000}
                   -> allowed, recorded.
        00:00:05 - John accidentally submits the exact same thing again
                   -> blocked, because only 5 seconds have passed.
        00:01:05 - John submits the exact same thing a third time
                   -> allowed, because 65 seconds have now passed.
    """
    existing_lock = connection.execute(
        text("""
            SELECT created_at FROM public.idempotency_locks
            WHERE group_id = :group_id AND request_hash = :request_hash
        """),
        {"group_id": group_id, "request_hash": request_hash},
    ).mappings().first()

    if existing_lock is not None:
        age_in_seconds = (
            datetime.now(timezone.utc) - existing_lock["created_at"]
        ).total_seconds()

        if age_in_seconds < window_seconds:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This exact expense was just submitted. "
                    "Please wait a moment before trying again."
                ),
            )

        connection.execute(
            text("""
                DELETE FROM public.idempotency_locks
                WHERE group_id = :group_id AND request_hash = :request_hash
            """),
            {"group_id": group_id, "request_hash": request_hash},
        )

    connection.execute(
        text("""
            INSERT INTO public.idempotency_locks (group_id, request_hash)
            VALUES (:group_id, :request_hash)
        """),
        {"group_id": group_id, "request_hash": request_hash},
    )


# ---------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------

@app.get("/", tags=["Health"])
def health_check():
    """Check whether the API is running."""
    return {"message": "Expense Sharing Engine API is running"}


@app.post(
    "/groups",
    tags=["Groups"],
    response_model=GroupCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an expense-sharing group",
)
def create_group(
    payload: GroupCreateRequest,
    user_id: UUID = Depends(get_authenticated_user),
):
    """Create a group and its members in one database transaction."""

    try:
        with engine.begin() as connection:
            group_id = connection.execute(
                text("""
                    INSERT INTO public.groups (name, created_by)
                    VALUES (:name, :created_by)
                    RETURNING id
                """),
                {
                    "name": payload.group_name,
                    "created_by": user_id,
                },
            ).scalar_one()

            connection.execute(
                text("""
                    INSERT INTO public.group_memberships
                        (group_id, user_id, role)
                    VALUES (:group_id, :user_id, :role)
                """),
                {
                    "group_id": group_id,
                    "user_id": user_id,
                    "role": "admin",
                },
            )

            saved_members = []

            for member in payload.members:
                member_id = connection.execute(
                    text("""
                        INSERT INTO public.members (group_id, name)
                        VALUES (:group_id, :name)
                        RETURNING id
                    """),
                    {
                        "group_id": group_id,
                        "name": member.name,
                    },
                ).scalar_one()

                saved_members.append({
                    "id": member_id,
                    "name": member.name,
                })

        return {
            "groupId": group_id,
            "groupName": payload.group_name,
            "members": saved_members,
        }

    except SQLAlchemyError:
        logging.exception("Failed to create group")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The group could not be created. Please try again.",
        )


@app.post(
    "/groups/{group_id}/expenses",
    tags=["Expenses"],
    response_model=ExpenseCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record an expense and calculate who owes who",
)
def create_expense(
    group_id: UUID,
    payload: ExpenseCreateRequest,
    user_id: UUID = Depends(get_authenticated_user),
):
    try:
        with engine.begin() as connection:

            # Step 1: Does this group even exist?
            get_group_or_404(connection, group_id)

            # Step 2: Is the logged-in user an admin of this group?
            require_group_admin(connection, group_id, user_id)

            # Step 3: Block exact duplicate requests sent within 1 minute.
            request_hash = compute_expense_fingerprint(
                user_id=user_id,
                group_id=group_id,
                total=payload.total,
                description=payload.description,
                payments=[(p.member_id, p.amount_paid) for p in payload.payments],
            )
            block_if_duplicate_expense(
                connection, group_id, request_hash, window_seconds=60
            )

            # Step 4: Load every member that belongs to this group.
            members = connection.execute(
                text("""
                    SELECT id, name
                    FROM public.members
                    WHERE group_id = :group_id
                    ORDER BY created_at ASC
                """),
                {"group_id": group_id},
            ).mappings().all()

            if not members:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This group has no members to split an expense with.",
                )

            member_ids_in_join_order = [member["id"] for member in members]
            member_names = {member["id"]: member["name"] for member in members}
            valid_member_ids = set(member_ids_in_join_order)

            # Step 5: Every member_id in the request must belong to THIS group.
            payment_member_ids = [p.member_id for p in payload.payments]

            unknown_ids = [
                member_id for member_id in payment_member_ids
                if member_id not in valid_member_ids
            ]
            if unknown_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="One or more members do not belong to this group.",
                )

            # Step 6: No member should appear twice in the same payment list.
            if len(payment_member_ids) != len(set(payment_member_ids)):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Each member can only appear once in a payment list.",
                )

            # Step 7: The total must match what people actually paid.
            amount_paid_by_member = {
                p.member_id: p.amount_paid for p in payload.payments
            }
            sum_of_payments = sum(amount_paid_by_member.values())

            if sum_of_payments != payload.total:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Payments add up to {sum_of_payments}, "
                        f"but total is {payload.total}."
                    ),
                )

            # Step 8: Do the math.
            balances = calculate_balances(
                member_ids_in_join_order, amount_paid_by_member, payload.total
            )
            fair_shares = calculate_fair_shares(
                member_ids_in_join_order, amount_paid_by_member, payload.total
            )

            # Step 9: Save the expense.
            expense_id = connection.execute(
                text("""
                    INSERT INTO public.expenses (group_id, total, description)
                    VALUES (:group_id, :total, :description)
                    RETURNING id
                """),
                {
                    "group_id": group_id,
                    "total": payload.total,
                    "description": payload.description,
                },
            ).scalar_one()

            # Step 10: Save each actual payment.
            for member_id, amount_paid in amount_paid_by_member.items():
                connection.execute(
                    text("""
                        INSERT INTO public.expense_payments
                            (expense_id, member_id, amount_paid)
                        VALUES (:expense_id, :member_id, :amount_paid)
                    """),
                    {
                        "expense_id": expense_id,
                        "member_id": member_id,
                        "amount_paid": amount_paid,
                    },
                )

            # Step 11: Turn balances into "who pays who" instructions.
            raw_instructions = simplify_debts(balances)

            settlements = [
                {
                    "from_member_id": instruction["from_member_id"],
                    "from_name": member_names[instruction["from_member_id"]],
                    "to_member_id": instruction["to_member_id"],
                    "to_name": member_names[instruction["to_member_id"]],
                    "amount": instruction["amount"],
                }
                for instruction in raw_instructions
            ]

            balance_results = [
                {
                    "member_id": member_id,
                    "name": member_names[member_id],
                    "paid": amount_paid_by_member.get(member_id, 0),
                    "fair_share": fair_shares[member_id],
                    "balance": balances[member_id],
                }
                for member_id in member_ids_in_join_order
            ]

        return {
            "expense_id": expense_id,
            "group_id": group_id,
            "total": payload.total,
            "description": payload.description,
            "balances": balance_results,
            "settlements": settlements,
        }

    except HTTPException:
        raise

    except SQLAlchemyError:
        logging.exception("Failed to create expense")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The expense could not be saved. Please try again.",
        )


@app.get(
    "/groups/{group_id}/expenses",
    tags=["Expenses"],
    summary="View all recorded expenses and their settlements for a group",
)
def list_group_expenses(
    group_id: UUID,
    user_id: UUID = Depends(get_authenticated_user),
):
    try:
        with engine.connect() as connection:
            get_group_or_404(connection, group_id)
            require_group_membership(connection, group_id, user_id)

            members = connection.execute(
                text("""
                    SELECT id, name FROM public.members
                    WHERE group_id = :group_id
                    ORDER BY created_at ASC
                """),
                {"group_id": group_id},
            ).mappings().all()

            member_ids_in_join_order = [m["id"] for m in members]
            member_names = {m["id"]: m["name"] for m in members}

            expenses = connection.execute(
                text("""
                    SELECT id, total, description, created_at
                    FROM public.expenses
                    WHERE group_id = :group_id
                    ORDER BY created_at DESC
                """),
                {"group_id": group_id},
            ).mappings().all()

            results = []

            for expense in expenses:
                payments = connection.execute(
                    text("""
                        SELECT member_id, amount_paid
                        FROM public.expense_payments
                        WHERE expense_id = :expense_id
                    """),
                    {"expense_id": expense["id"]},
                ).mappings().all()

                amount_paid_by_member = {
                    p["member_id"]: p["amount_paid"] for p in payments
                }

                balances = calculate_balances(
                    member_ids_in_join_order, amount_paid_by_member, expense["total"]
                )
                fair_shares = calculate_fair_shares(
                    member_ids_in_join_order, amount_paid_by_member, expense["total"]
                )
                raw_instructions = simplify_debts(balances)

                results.append({
                    "expense_id": expense["id"],
                    "description": expense["description"],
                    "total": expense["total"],
                    "created_at": expense["created_at"],
                    "balances": [
                        {
                            "member_id": member_id,
                            "name": member_names[member_id],
                            "paid": amount_paid_by_member.get(member_id, 0),
                            "fair_share": fair_shares[member_id],
                            "balance": balances[member_id],
                        }
                        for member_id in member_ids_in_join_order
                    ],
                    "settlements": [
                        {
                            "from_member_id": i["from_member_id"],
                            "from_name": member_names[i["from_member_id"]],
                            "to_member_id": i["to_member_id"],
                            "to_name": member_names[i["to_member_id"]],
                            "amount": i["amount"],
                        }
                        for i in raw_instructions
                    ],
                })

        return {"groupId": group_id, "expenses": results}

    except HTTPException:
        raise

    except SQLAlchemyError:
        logging.exception("Failed to load expenses")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not load expenses. Please try again.",
        )