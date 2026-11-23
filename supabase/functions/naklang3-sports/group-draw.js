function randomSource(seed) {
  let state = 2166136261;
  for (const letter of seed) state = Math.imul(state ^ letter.charCodeAt(0), 16777619);
  if (!state) state = 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function shuffle(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function groupPairs(plan, order, group) {
  const teams = group.map(slot => plan.sources[order[slot]]);
  const pairs = [];
  for (let a = 0; a < teams.length; a++) {
    for (let b = a + 1; b < teams.length; b++) {
      for (const first of teams[a]) for (const second of teams[b]) {
        pairs.push((Math.min(first, second) - 1) * 10 + Math.max(first, second) - 1);
      }
    }
  }
  return pairs;
}

function signature(plan, order) {
  return plan.groups.map(group => group.flatMap(slot => plan.sources[order[slot]])
    .sort((a, b) => a - b).join(',')).sort().join('|');
}

function stateFor(plans, orders) {
  const counts = Array(100).fill(0);
  const signatures = new Map();
  for (let index = 0; index < plans.length; index++) {
    const plan = plans[index];
    for (const group of plan.groups) for (const pair of groupPairs(plan, orders[index], group)) counts[pair]++;
    const key = signature(plan, orders[index]);
    signatures.set(key, (signatures.get(key) || 0) + 1);
  }
  const pairCost = counts.reduce((sum, count) => sum + count * (count - 1) / 2, 0);
  const duplicates = [...signatures.values()].reduce((sum, count) => sum + count * (count - 1) / 2, 0);
  return {counts, signatures, score: pairCost + duplicates * 10};
}

function metrics(plans, orders) {
  const state = stateFor(plans, orders);
  const possible = new Set();
  for (const plan of plans) {
    const numbers = Object.keys(plan.sources);
    for (let a = 0; a < numbers.length; a++) for (let b = a + 1; b < numbers.length; b++) {
      for (const first of plan.sources[numbers[a]]) for (const second of plan.sources[numbers[b]]) {
        possible.add((Math.min(first, second) - 1) * 10 + Math.max(first, second) - 1);
      }
    }
  }
  return {
    distinctPairs: state.counts.filter(Boolean).length,
    possiblePairs: possible.size,
    maxPairMeetings: Math.max(0, ...state.counts),
    repeatedPairCost: state.counts.reduce((sum, count) => sum + count * (count - 1) / 2, 0),
    duplicatePartitions: [...state.signatures.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
  };
}

export function createGroupDraw(inputPlans, seed, previous = {}) {
  if (!inputPlans.length) throw new Error('ไม่มีรายการแบ่งสายให้สุ่ม');
  const plans = inputPlans.map(plan => {
    const numbers = plan.entries.map(entry => entry.number);
    const sources = Object.fromEntries(plan.entries.map(entry => [entry.number, entry.sourceNumbers.map(Number)]));
    const groups = plan.groups.map(group => group.map(slot => plan.slots.indexOf(slot)));
    if (numbers.length !== plan.slots.length || new Set(numbers).size !== numbers.length ||
        groups.flat().length !== plan.slots.length || new Set(groups.flat()).size !== plan.slots.length ||
        groups.flat().some(slot => slot < 0) || plan.entries.some(entry => !entry.school)) {
      throw new Error('กำหนดเลขโรงเรียนให้ครบ และตรวจจำนวนทีมในแต่ละรายการก่อนสุ่มสาย');
    }
    return {...plan, numbers, sources, groups};
  });
  const initial = plans.map(plan => plan.slots.map((slot, index) => previous[plan.key]?.[slot] || plan.numbers[index]));
  const before = metrics(plans, initial);
  const random = randomSource(seed);
  let bestOrders = initial.map(order => [...order]);
  let bestScore = stateFor(plans, initial).score;
  for (let restart = 0; restart < 3; restart++) {
    const orders = plans.map(plan => shuffle(plan.numbers, random));
    const state = stateFor(plans, orders);
    for (let iteration = 0; iteration < 30000; iteration++) {
      const index = Math.floor(random() * plans.length);
      const plan = plans[index];
      const order = orders[index];
      const a = Math.floor(random() * order.length);
      const b = Math.floor(random() * order.length);
      const groupA = plan.groups.find(group => group.includes(a));
      const groupB = plan.groups.find(group => group.includes(b));
      if (groupA === groupB) continue;
      const oldSignature = signature(plan, order);
      const oldPairs = [...groupPairs(plan, order, groupA), ...groupPairs(plan, order, groupB)];
      let delta = 0;
      for (const pair of oldPairs) { delta -= state.counts[pair] - 1; state.counts[pair]--; }
      [order[a], order[b]] = [order[b], order[a]];
      const newPairs = [...groupPairs(plan, order, groupA), ...groupPairs(plan, order, groupB)];
      for (const pair of newPairs) { delta += state.counts[pair]; state.counts[pair]++; }
      const newSignature = signature(plan, order);
      if (oldSignature !== newSignature) {
        delta += 10 * ((state.signatures.get(newSignature) || 0) - (state.signatures.get(oldSignature) - 1));
      }
      const temperature = 2 * (1 - iteration / 30000) + 0.02;
      if (delta <= 0 || random() < Math.exp(-delta / temperature)) {
        state.score += delta;
        if (oldSignature !== newSignature) {
          state.signatures.set(oldSignature, state.signatures.get(oldSignature) - 1);
          state.signatures.set(newSignature, (state.signatures.get(newSignature) || 0) + 1);
        }
        if (state.score <= bestScore) {
          bestScore = state.score;
          bestOrders = orders.map(order => [...order]);
        }
      } else {
        for (const pair of newPairs) state.counts[pair]--;
        for (const pair of oldPairs) state.counts[pair]++;
        [order[a], order[b]] = [order[b], order[a]];
      }
    }
  }
  const assignments = Object.fromEntries(plans.map((plan, index) => {
    const order = [...bestOrders[index]];
    for (const group of plan.groups) {
      const values = shuffle(group.map(slot => order[slot]), random);
      group.forEach((slot, i) => { order[slot] = values[i]; });
    }
    return [plan.key, Object.fromEntries(plan.slots.map((slot, i) => [slot, order[i]]))];
  }));
  const after = metrics(plans, plans.map(plan => plan.slots.map(slot => assignments[plan.key][slot])));
  const initialAssignments = Object.fromEntries(plans.map((plan, index) =>
    [plan.key, Object.fromEntries(plan.slots.map((slot, i) => [slot, initial[index][i]]))]));
  return {algorithm: 'balanced-school-pairs-v1', seed, initialAssignments, assignments, before, after, events: plans.length};
}
