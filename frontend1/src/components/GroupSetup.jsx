import { isValidGroupName, isValidPersonName } from '../utils.js';

export default function GroupSetup({ groupName, updateGroupName, peopleCount, updateCount, validPeopleCount, members, updateMember, createGroup, loading }) {
  return (
    <section className="panel">
      <div className="panel-heading"><div><span className="section-index">01 / GROUP SETUP</span><h2>Who’s in the group?</h2><p>Give your group a name and add everyone taking part.</p></div><div className="heading-icon">♧</div></div>
      <div className="form-grid group-meta">
        <label className="field"><span>Group name <b>*</b></span><input value={groupName} onChange={(e) => updateGroupName(e.target.value)} placeholder="e.g. Weekend getaway" maxLength={70} aria-invalid={Boolean(groupName.trim()) && !isValidGroupName(groupName)} /><small>Letters, numbers, spaces, hyphens and apostrophes.</small></label>
        <label className="field"><span>Number of people <b>*</b></span><input type="number" min="2" max="30" step="1" value={peopleCount} onChange={(e) => updateCount(e.target.value)} /><small>Choose between 2 and 30 people.</small></label>
      </div>
      <div className="member-heading"><div><h3>Group members <span className="count-pill">{validPeopleCount ? members.length : '—'}</span></h3><p>Names can repeat. We’ll help you identify the right person.</p></div><span className="required-note">* Required</span></div>
      <div className="member-list">
        {members.map((member, index) => (
          <div className="member-row" key={member.rowKey}>
            <span className="member-number">{String(index + 1).padStart(2, '0')}</span>
            <label className="field member-field"><span className="sr-only">Member {index + 1} name</span><input value={member.name} onChange={(e) => updateMember(member.rowKey, e.target.value)} placeholder={`Person ${index + 1} full name`} maxLength={80} aria-invalid={Boolean(member.name.trim()) && !isValidPersonName(member.name)} /></label>
            <span className="new-tag">{member.name.trim() ? 'Ready' : 'Name required'}</span>
          </div>
        ))}
      </div>
      <div className="panel-footer"><span className="privacy-note"><span>♢</span> People with the same name are still tracked separately.</span><button className="button button-primary" onClick={createGroup} disabled={loading || !validPeopleCount}>{loading ? 'Please wait…' : 'Create group'} <span>→</span></button></div>
    </section>
  );
}
