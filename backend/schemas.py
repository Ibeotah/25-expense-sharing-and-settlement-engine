# Goal: To define the data shapes (validation rules and response structures) for incoming requests and outgoing responses in the API.

# MemberInput: Validates a single member's name to ensure it is not empty, too short, or too long.

# GroupCreateRequest: Validates the data required when creating a new group (a group name and a list of members).

# MemberResponse: Defines the exact data shape (ID and name) sent back to the client after a member is successfully created or fetched.

# GroupCreateResponse: Defines the exact data shape sent back to the client when a group is successfully created, including the new group's ID, name, and list of members.

# schemas.py

# schemas.py
#
# Goal: Define the shape of data coming into the API (requests)
# and going out of the API (responses), with validation rules attached.

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MemberInput(BaseModel):
    """
    One member's name, sent when creating a group.

    Example: {"name": "John"}
    """
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Member name cannot be empty.")
        return value


class GroupCreateRequest(BaseModel):
    """
    What React sends to create a group.

    Example:
        {
          "groupName": "Weekend Trip",
          "members": [{"name": "John"}, {"name": "John"}, {"name": "Belema"}]
        }
    """
    model_config = ConfigDict(populate_by_name=True)

    group_name: str = Field(alias="groupName", min_length=1, max_length=100)
    members: list[MemberInput] = Field(min_length=1, max_length=50)

    @field_validator("group_name")
    @classmethod
    def validate_group_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Group name cannot be empty.")
        return value


class MemberResponse(BaseModel):
    """
    One saved member, sent back to React after creation.

    Example: {"id": "uuid-101", "name": "John"}
    """
    id: UUID
    name: str


class GroupCreateResponse(BaseModel):
    """
    What FastAPI sends back after a group is created.

    Example:
        {
          "groupId": "group-001",
          "groupName": "Weekend Trip",
          "members": [
            {"id": "uuid-101", "name": "John"},
            {"id": "uuid-102", "name": "John"},
            {"id": "uuid-103", "name": "Belema"}
          ]
        }
    """
    groupId: UUID
    groupName: str
    members: list[MemberResponse]


class ExpensePaymentInput(BaseModel):
    """
    One person's contribution to an expense.

    Example: {"memberId": "uuid-101", "amountPaid": 6000}
    """
    model_config = ConfigDict(populate_by_name=True)

    member_id: UUID = Field(alias="memberId")
    amount_paid: int = Field(alias="amountPaid", gt=0)
    # gt=0 rejects zero or negative payments automatically.


class ExpenseCreateRequest(BaseModel):
    """
    What React sends to record an expense.

    Example:
        {
          "total": 10000,
          "description": "Food",
          "payments": [
            {"memberId": "uuid-101", "amountPaid": 6000},
            {"memberId": "uuid-103", "amountPaid": 4000}
          ]
        }
    """
    model_config = ConfigDict(populate_by_name=True)

    total: int = Field(gt=0)
    description: str | None = Field(default=None, max_length=255)
    payments: list[ExpensePaymentInput] = Field(min_length=1)


class MemberBalanceResponse(BaseModel):
    member_id: UUID
    name: str
    paid: int
    fair_share: int
    balance: int  # positive = owed money, negative = owes money


class SettlementInstructionResponse(BaseModel):
    from_member_id: UUID
    from_name: str
    to_member_id: UUID
    to_name: str
    amount: int


class ExpenseCreateResponse(BaseModel):
    expense_id: UUID
    group_id: UUID
    total: int
    description: str | None
    balances: list[MemberBalanceResponse]
    settlements: list[SettlementInstructionResponse]