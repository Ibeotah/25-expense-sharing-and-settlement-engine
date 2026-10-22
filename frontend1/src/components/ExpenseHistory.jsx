import { money, paymentMemberName } from '../utils.js';

export default function ExpenseHistory({ history, loading, error, groupName, members, onRefresh }) {
  return (
    <section className="panel results-panel" aria-live="polite">
      <div className="panel-heading"><div><span className="section-index">04 / EXPENSE HISTORY</span><h2>Saved expenses.</h2><p>Expense records for {groupName || 'your group'}.</p></div><button type="button" className="button button-outline" onClick={onRefresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh history'}</button></div>
      {error && <div className="alert alert-error" role="alert"><span>!</span><p>{error}</p></div>}
      {!error && loading && <p role="status">Loading expense history…</p>}
      {!error && !loading && history.length === 0 && <p className="empty-settlement">No saved expenses yet.</p>}
      {!error && history.length > 0 && <div className="settlement-list">{history.map((expense, index) => (
        <article className="settlement-row" key={expense.id || `${expense.description || 'expense'}-${index}`}>
          <span className="settlement-avatar">₦</span>
          <div>
            <b>{expense.description || 'Shared expense'}</b>
            {expense.created_at && <small>{new Date(expense.created_at).toLocaleString()}</small>}
            <small>{expense.balances.map((item) => {
              const member = members.find((savedMember) => savedMember.id === item.memberId);
              return `${item.name || member?.name || 'Member'}: paid ${money(item.contributed)}, balance ${money(item.balance)}`;
            }).join(' · ')}</small>
            {expense.settlements.length > 0
              ? expense.settlements.map((item, paymentIndex) => (
                <small key={`${item.fromId || item.from}-${item.toId || item.to}-${paymentIndex}`}>
                  {paymentMemberName(item, 'from', members)} pays {paymentMemberName(item, 'to', members)} {money(item.amount)}
                </small>
              ))
              : <small>No payments needed.</small>}
          </div>
          <strong>{money(expense.total)}</strong>
        </article>
      ))}</div>}
    </section>
  );
}
