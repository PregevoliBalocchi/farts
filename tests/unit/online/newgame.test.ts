// The new-game form (src/online/newgame.ts): seats, colours, who starts, and what blocks creation.
import { describe, expect, it } from 'vitest';
import { addSeat, moveSeat, newDraft, problems, removeSeat, seatLabel, setColor, setMode, setWho, toSetup } from '../../../src/online/newgame';

const ME = 'me@example.com';

describe('new game form', () => {
  it('an online draft seats you first and keeps your seat', () => {
    const d = newDraft('online', ME);
    expect(d.seats.map((s) => s.who)).toEqual([ME, '']);
    expect(setWho(d, 0, 'x@example.com')).toBe(d);
    expect(removeSeat(addSeat(d), 0).seats.length).toBe(3);
  });

  it('added seats take the first free colour and stop at four', () => {
    const d = addSeat(addSeat(setColor(newDraft('online', ME), 0, 2)));
    expect(d.seats.map((s) => s.color)).toEqual([2, 1, 0, 3]);
    expect(addSeat(d)).toBe(d);
  });

  it('choosing a taken colour swaps it with the seat that had it', () => {
    const d = setColor(newDraft('hotseat', ME), 0, 2);
    expect(d.seats.map((s) => s.color)).toEqual([2, 1, 0]);
  });

  it('the starting seat follows its player when seats move or go', () => {
    let d = { ...newDraft('hotseat', ME), first: 1 };
    d = moveSeat(d, 1, -1);
    expect(d.first).toBe(0);
    d = removeSeat(d, 2);
    expect(d.first).toBe(0);
    d = removeSeat({ ...d, seats: [...d.seats, { who: '', color: 3 }] }, 0);
    expect(d.first).toBeNull();
  });

  it('never goes below two seats', () => {
    const d = removeSeat(newDraft('hotseat', ME), 0);
    expect(removeSeat(d, 0)).toBe(d);
  });

  it('online needs a valid, different address for every seat', () => {
    let d = addSeat(newDraft('online', ME));
    expect(problems(d).map((p) => p.seat)).toEqual([1, 2]);
    d = setWho(setWho(d, 1, 'Bruno@Example.com '), 2, 'bruno@example.com');
    expect(problems(d)).toEqual([{ seat: 2, text: 'Compare due volte' }]);
    d = setWho(d, 2, 'not an address');
    expect(problems(d)[0].text).toBe('Indirizzo non valido');
  });

  it('a ready online draft gives addresses, colours and the starter in seat order', () => {
    const d = { ...setColor(setWho(newDraft('online', ME), 1, ' Bruno@Example.com'), 0, 3), variant: 'leaders' as const, first: 1 };
    expect(toSetup(d)).toEqual({ mode: 'online', variant: 'leaders', players: [ME, 'bruno@example.com'], colors: [3, 1], firstPlayer: 1 });
  });

  it('hotseat names may be blank but not repeated', () => {
    const d = setWho(setWho(newDraft('hotseat', ME), 0, 'Anna'), 1, ' anna ');
    expect(problems(d)).toEqual([{ seat: 1, text: 'Nome già usato' }]);
    expect(() => toSetup(d)).toThrow('Giocatore 2: Nome già usato');
    expect(toSetup(setWho(d, 1, '')).players).toEqual(['Anna', '', '']);
  });

  it('switching mode keeps colours and puts you first online', () => {
    const d = setMode(setWho(setColor(newDraft('hotseat', ME), 1, 3), 1, 'Bruno'), 'online', ME);
    expect(d.seats).toEqual([{ who: ME, color: 0 }, { who: '', color: 3 }, { who: '', color: 2 }]);
  });

  it('a seat is labelled by its name, its address before @, or its number', () => {
    expect(seatLabel('Anna', 0)).toBe('Anna');
    expect(seatLabel('bruno.rossi@example.com', 1)).toBe('bruno.rossi');
    expect(seatLabel('  ', 2)).toBe('Giocatore 3');
  });
});
