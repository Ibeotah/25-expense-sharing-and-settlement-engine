import { useEffect, useState } from 'react';
import { request } from '../api.js';
import { isValidGroupName, isValidPersonName, normaliseName } from '../utils.js';

const createEmptyMember = () => ({ rowKey: crypto.randomUUID(), name: '' });
const personNameError = 'Names can only contain letters, spaces, hyphens and apostrophes.';
const groupNameError = 'Group names can use letters, numbers, spaces, hyphens, apostrophes, & and periods.';

export default function useGroupSetup({ ownerId, setExpenses, setResults, setError, setNotice, setLoading }) {
  const [groupName, setGroupName] = useState('');
  const [peopleCount, setPeopleCount] = useState('3');
  const [members, setMembers] = useState([createEmptyMember(), createEmptyMember(), createEmptyMember()]);
  const [groupId, setGroupId] = useState('');
  const [savedMembers, setSavedMembers] = useState([]);
  const peopleNumber = Number(peopleCount);
  const validPeopleCount = Number.isInteger(peopleNumber) && peopleNumber >= 2 && peopleNumber <= 30;

  useEffect(() => {
    setGroupName('');
    setPeopleCount('3');
    setMembers([createEmptyMember(), createEmptyMember(), createEmptyMember()]);
    setGroupId('');
    setSavedMembers([]);
    setExpenses({});
    setResults(null);
    setError('');
    setNotice('');
  }, [ownerId, setError, setExpenses, setNotice, setResults]);

  // Shows the message while the text is invalid and clears it again once it is fixed or emptied.
  function validateName(value, isValid, message) {
    if (!value.trim() || isValid(value)) setError((currentError) => currentError === message ? '' : currentError);
    else setError(message);
  }

  function updateGroupName(value) {
    setGroupName(value);
    validateName(value, isValidGroupName, groupNameError);
    invalidateGroup();
  }

  function invalidateGroup() {
    setGroupId('');
    setSavedMembers([]);
    setResults(null);
  }

  function updateCount(value) {
    setPeopleCount(value);
    const count = Number(value);
    if (!Number.isInteger(count) || count < 2 || count > 30) return;
    const nextMembers = Array.from({ length: count }, (_, index) => members[index] || createEmptyMember());
    setMembers(nextMembers);
    setExpenses((previous) => Object.fromEntries(nextMembers.map((member) => [member.rowKey, previous[member.rowKey] ?? ''])));
    invalidateGroup();
  }

  function updateMember(rowKey, name) {
    validateName(name, isValidPersonName, personNameError);
    setMembers((previous) => previous.map((member) => member.rowKey === rowKey ? { ...member, name } : member));
    invalidateGroup();
  }

  async function createGroup() {
    setError('');
    setNotice('');
    if (!groupName.trim()) return setError('Enter a group name.');
    if (!isValidGroupName(groupName)) return setError(groupNameError);
    if (!validPeopleCount) return setError('Enter a whole number of people between 2 and 30.');
    if (members.some((member) => !normaliseName(member.name))) return setError('Enter a name for every member.');
    if (members.some((member) => !isValidPersonName(member.name))) return setError(personNameError);
    setLoading(true);
    try {
      const payload = {
        groupName: normaliseName(groupName),
        members: members.map((member) => ({ name: normaliseName(member.name) })),
      };
      const data = await request('/groups', { method: 'POST', body: JSON.stringify(payload) });
      const returnedMembers = data.members || [];
      if (returnedMembers.length !== members.length) throw new Error('The API did not return the expected number of members.');
      const newGroupId = data.groupId;
      if (!newGroupId) throw new Error('The API did not return the new group ID.');
      if (returnedMembers.some((person) => !person.id || !person.name)) {
        throw new Error('The API response must include an ID and name for every member.');
      }
      if (new Set(returnedMembers.map((person) => person.id)).size !== returnedMembers.length) {
        throw new Error('The API returned duplicate member IDs for this group.');
      }
      setGroupId(newGroupId);
      setMembers((previous) => previous.map((member, index) => ({
        ...member,
        name: returnedMembers[index].name || normaliseName(member.name),
      })));
      setSavedMembers(returnedMembers.map((person, index) => ({
        id: person.id,
        name: person.name || normaliseName(members[index].name),
        rowKey: members[index].rowKey,
      })));
      setNotice('Group created. Enter each member’s contribution below.');
      setResults(null);
    } catch (err) {
      setError(err.message || 'Could not create the group.');
    } finally {
      setLoading(false);
    }
  }

  return {
    groupName, setGroupName, updateGroupName, peopleCount, members, groupId, savedMembers,
    validPeopleCount, updateCount, updateMember, invalidateGroup, createGroup,
  };
}
