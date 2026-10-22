export const money = (value) => new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', maximumFractionDigits: 2,
}).format(Number(value || 0));

export const normaliseName = (value) => value.trim().replace(/\s+/g, ' ');

export function paymentMemberName(payment, side, members) {
  const explicitName = payment[`${side}Name`];
  if (explicitName) return explicitName;

  const value = payment[side];
  const memberId = payment[`${side}Id`]
    || payment[`${side}MemberId`]
    || payment[`${side}_member_id`]
    || value;
  const member = members.find((item) => item.id === memberId);
  if (member) return member.name;
  if (value) return value;

  return 'Member';
}

// Keep the validation rules aligned with the API's server-side validation.
const personNamePattern = /^\p{L}+(?:[ '’-]\p{L}+)*$/u; // Anne-Marie, Seán O'Brien
const groupNamePattern = /^[\p{L}\p{N}][\p{L}\p{N} '’&.-]*$/u; // Flat 4B, Mama's & Sons

export const isValidPersonName = (value) => {
  const name = normaliseName(value);
  return name.length > 0 && name.length <= 80 && personNamePattern.test(name);
};

export const isValidGroupName = (value) => {
  const name = normaliseName(value);
  return name.length > 0 && name.length <= 70 && groupNamePattern.test(name);
};

export const sanitizeMoneyInput = (value) => {
  const numericCharacters = value.replace(/[^\d.]/g, '');
  const decimalPoint = numericCharacters.indexOf('.');
  if (decimalPoint === -1) return numericCharacters;

  const wholeNumber = numericCharacters.slice(0, decimalPoint);
  const decimalPlaces = numericCharacters.slice(decimalPoint + 1).replace(/\./g, '').slice(0, 2);
  return `${wholeNumber}.${decimalPlaces}`;
};

export const toKobo = (nairaAmount) => Math.round(Number(nairaAmount) * 100);

export const fromKobo = (koboAmount) => Number(koboAmount) / 100;
export const MAX_KOBO = 10 ** 12;

export function calculateSuggestedPayments(totalKobo, payments, members) {
  const baseShare = Math.floor(totalKobo / members.length);
  const remainder = totalKobo % members.length;
  const paidByMemberId = new Map(payments.map((payment) => [payment.memberId, payment.amountPaid]));
  const balances = members.map((member, index) => ({
    ...member,
    balance: Number(paidByMemberId.get(member.id)) - baseShare - (index < remainder ? 1 : 0),
  }));
  const debtors = balances.filter((member) => member.balance < 0)
    .map((member) => ({ ...member, remaining: -member.balance }));
  const creditors = balances.filter((member) => member.balance > 0)
    .map((member) => ({ ...member, remaining: member.balance }));
  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const amount = Math.min(debtors[debtorIndex].remaining, creditors[creditorIndex].remaining);
    settlements.push({
      from: debtors[debtorIndex].name,
      fromId: debtors[debtorIndex].id,
      to: creditors[creditorIndex].name,
      toId: creditors[creditorIndex].id,
      amount: fromKobo(amount),
    });
    debtors[debtorIndex].remaining -= amount;
    creditors[creditorIndex].remaining -= amount;
    if (debtors[debtorIndex].remaining === 0) debtorIndex++;
    if (creditors[creditorIndex].remaining === 0) creditorIndex++;
  }

  return settlements;
}

const koboAmountFields = ['total', 'contributed', 'spent', 'amountPaid', 'share', 'equalShare', 'balance', 'netBalance', 'amount', 'amountToPay', 'settled'];

export function convertSettlementFromKobo(data) {
  const convertAmounts = (items = []) => items.map((item) => Object.fromEntries(
    Object.entries(item).map(([key, value]) => [
      key,
      koboAmountFields.includes(key) && value != null ? fromKobo(value) : value,
    ]),
  ));

  return {
    ...data,
    ...(data.balances ? { balances: convertAmounts(data.balances) } : {}),
    ...(data.members ? { members: convertAmounts(data.members) } : {}),
    ...(data.settlements ? { settlements: convertAmounts(data.settlements) } : {}),
    ...(data.payments ? { payments: convertAmounts(data.payments) } : {}),
  };
}
