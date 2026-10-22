# settlement.py
#
# This file has no database calls. It only does math.
# Goal: given a list of group members, a list of who paid what,
# and the total cost, figure out:
#   1. What each member's fair share is.
#   2. Who owes who, with the fewest payments possible.

from uuid import UUID
import hashlib
import json

def calculate_fair_shares(
    member_ids_in_join_order: list[UUID],
    amount_paid_by_member: dict[UUID, int],
    total: int,
) -> dict[UUID, int]:
    """
    Split `total` equally across every member in the group.

    Example:
        3 members, total = 10000 kobo
        10000 / 3 = 3333 kobo each, with 1 kobo left over (the remainder)

        We cannot throw away that 1 kobo, so we give it to
        whoever paid the most. If there's a tie, we give it to
        whoever joined the group first.
    """
    member_count = len(member_ids_in_join_order)
    base_share, remainder = divmod(total, member_count)

    shares = {member_id: base_share for member_id in member_ids_in_join_order}

    if remainder == 0:
        return shares

    if amount_paid_by_member:
        highest_amount_paid = max(amount_paid_by_member.values())
        top_payers = [
            member_id
            for member_id, paid in amount_paid_by_member.items()
            if paid == highest_amount_paid
        ]

        if len(top_payers) == 1:
            member_who_absorbs_remainder = top_payers[0]
        else:
            # Tie: pick whoever joined the group earliest.
            join_order = {
                member_id: position
                for position, member_id in enumerate(member_ids_in_join_order)
            }
            member_who_absorbs_remainder = min(
                top_payers, key=lambda member_id: join_order[member_id]
            )
    else:
        # No one paid anything (should not normally happen).
        # Fall back to the first member ever added to the group.
        member_who_absorbs_remainder = member_ids_in_join_order[0]

    shares[member_who_absorbs_remainder] += remainder
    return shares


def calculate_balances(
    member_ids_in_join_order: list[UUID],
    amount_paid_by_member: dict[UUID, int],
    total: int,
) -> dict[UUID, int]:
    """
    Balance = amount paid - fair share.

    Positive balance = this person overpaid. Others owe them money.
    Negative balance = this person underpaid. They owe money.
    Zero balance = this person paid exactly their fair share.

    Example:
        John paid 4000, fair share is 2000 -> balance = +2000 (is owed 2000)
        Belema paid 1000, fair share is 2000 -> balance = -1000 (owes 1000)
    """
    fair_shares = calculate_fair_shares(
        member_ids_in_join_order, amount_paid_by_member, total
    )

    balances = {}
    for member_id in member_ids_in_join_order:
        paid = amount_paid_by_member.get(member_id, 0)
        fair_share = fair_shares[member_id]
        balances[member_id] = paid - fair_share

    return balances


def simplify_debts(balances: dict[UUID, int]) -> list[dict]:
    """
    Turn a pile of balances into the smallest possible list of payments.

    Example:
        John    = +2666  (is owed 2666)
        Belema  = +667   (is owed 667)
        Peter   = -3333  (owes 3333)

        Step 1: Peter (biggest debtor) pays John (biggest creditor)
                as much as possible: min(3333, 2666) = 2666
                -> Peter now owes 667. John is fully settled.

        Step 2: Peter pays Belema the remaining 667.
                -> Everyone is now at zero.

        Result:
            Peter pays John   2666
            Peter pays Belema 667
    """
    creditors = sorted(
        [[member_id, balance] for member_id, balance in balances.items() if balance > 0],
        key=lambda pair: -pair[1],
    )
    debtors = sorted(
        [[member_id, balance] for member_id, balance in balances.items() if balance < 0],
        key=lambda pair: pair[1],
    )

    instructions = []
    i, j = 0, 0

    while i < len(debtors) and j < len(creditors):
        debtor_id, debt_amount = debtors[i]
        creditor_id, credit_amount = creditors[j]

        payment_amount = min(-debt_amount, credit_amount)

        instructions.append({
            "from_member_id": debtor_id,
            "to_member_id": creditor_id,
            "amount": payment_amount,
        })

        debtors[i][1] += payment_amount
        creditors[j][1] -= payment_amount

        if debtors[i][1] == 0:
            i += 1
        if creditors[j][1] == 0:
            j += 1

    return instructions

def compute_expense_fingerprint(
    user_id: UUID,
    group_id: UUID,
    total: int,
    description: str | None,
    payments: list[tuple[UUID, int]],
) -> str:
    """
    Turn the contents of an expense request into one fixed string.
    Two identical requests always produce the same string.

    Example:
        Request A: total=10000, John:6000, Belema:4000
        Request B: total=10000, Belema:4000, John:6000  (different order)

        Both produce the same fingerprint, because we sort
        payments by member_id before hashing.
    """
    sorted_payments = sorted(
        [{"member_id": str(mid), "amount_paid": amount} for mid, amount in payments],
        key=lambda p: p["member_id"],
    )

    source = {
        "user_id": str(user_id),
        "group_id": str(group_id),
        "total": total,
        "description": description,
        "payments": sorted_payments,
    }

    canonical = json.dumps(source, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()