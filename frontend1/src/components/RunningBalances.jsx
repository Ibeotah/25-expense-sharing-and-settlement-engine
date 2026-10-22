import { money, paymentMemberName } from '../utils.js';

export default function RunningBalances({ ledger, groupName, members, onMarkPaid, loading }) {
  if (!ledger) return null;
  const balances = ledger.balances || [];
  const settlements = ledger.settlements || [];
  return (
    <section className="panel results-panel" aria-live="polite">
      <div className="panel-heading"><div><span className="section-index">05 / RUNNING BALANCES</span><h2>Where the group stands.</h2><p>Every saved expense and recorded payment for {groupName || 'your group'}, added together.</p></div><div className="heading-icon success-icon">∑</div></div>
      <div className="table-wrap"><table><thead><tr><th>Member</th><th>Paid in</th><th>Fair share</th><th>Net balance</th><th>Status</th></tr></thead><tbody>{balances.map((item) => { const balance = Number(item.balance ?? 0); return <tr key={item.memberId}><td><div className="table-person"><span className="avatar small-avatar">{item.name?.[0]?.toUpperCase() || '?'}</span><span><b>{item.name}</b></span></div></td><td>{money(item.contributed)}</td><td>{money(item.share)}</td><td className={balance > 0.005 ? 'positive' : balance < -0.005 ? 'negative' : ''}>{balance > 0.005 ? '+' : ''}{money(balance)}</td><td><span className={`status-pill ${balance > 0.005 ? 'status-credit' : balance < -0.005 ? 'status-debit' : 'status-even'}`}>{balance > 0.005 ? 'Gets back' : balance < -0.005 ? 'Owes' : 'Settled'}</span></td></tr>; })}</tbody></table></div>
      <p className="ledger-note">Net balance is what a person paid in, minus their fair share, adjusted for any payments already recorded.</p>
      <div className="settlement-block"><h3>Payments still needed</h3>{settlements.length ? <div className="settlement-list">{settlements.map((item, index) => <div className="settlement-row" key={`${item.fromId || item.fromMemberId || item.from}-${item.toId || item.toMemberId || item.to}-${index}`}><span className="settlement-avatar">↗</span><div><b>{paymentMemberName(item, 'from', members)} <span>pays</span> {paymentMemberName(item, 'to', members)}</b><small>Mark it as paid once the money has changed hands</small></div><strong>{money(item.amount)}</strong><button type="button" className="button button-outline mark-paid" disabled={loading} onClick={() => onMarkPaid(item)}>Mark as paid</button></div>)}</div> : <p className="empty-settlement">Everyone is settled up. No payments needed.</p>}</div>
    </section>
  );
}
