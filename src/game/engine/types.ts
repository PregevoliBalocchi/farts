// Core data model of the rules engine. Pure data: no functions, no classes,
// so a GameState can be serialized (save games, undo, network) as plain JSON.
// Names are neutral on purpose: the owner's content file supplies the labels.

export type PlayerId = number; // seat index 0..playerCount-1
export type PlayerCount = 2 | 3 | 4;

export type Resource = 'material' | 'fuel' | 'weapons' | 'relic' | 'psionic';
export const RESOURCES: readonly Resource[] = ['material', 'fuel', 'weapons', 'relic', 'psionic'];

export type ActionKind = 'tax' | 'build' | 'repair' | 'move' | 'battle' | 'secure' | 'influence';

export type AmbitionId = 'wealth' | 'captives' | 'trophies' | 'relics' | 'psionics';
export const AMBITIONS: readonly AmbitionId[] = ['wealth', 'captives', 'trophies', 'relics', 'psionics'];

// ---------------------------------------------------------------- content ---

/** One action card in the deck. */
export interface ActionCardDef {
  id: string;
  suit: string;
  number: number;
  /** Actions granted when played as lead / surpass / pivot. */
  pips: number;
  /** Only in games with at least this many players (e.g. the 1s and 7s: 4). */
  minPlayers?: PlayerCount;
}

export type CourtKind = 'faction' | 'decree';

/** A card's printed words in one language (owner content). */
export interface CardWords {
  name?: string;
  text?: string;
  crisis?: string;
}

/** Presentation only (owner content): a card's printed name and rules text, and their translations by language code. */
export interface PrintedWords {
  name?: string;
  text?: string;
  i18n?: Record<string, CardWords>;
}

export interface CourtCardDef {
  id: string;
  kind: CourtKind;
  /** Resource icon(s) printed on the card, if any (used by effects/scoring hooks). */
  resource?: Resource;
  /** Key icons printed on the card (used when raiding / stealing). */
  keys?: number;
  /** Which box/mode the card belongs to (absent = base game). Only the game's `courtSets` go in the Court deck. */
  set?: string;
  /** Hook id resolved by an effect registry (decree on secure, faction passive). */
  effect?: string;
  /** Presentation only (owner content): the printed name and rules text (**bold**, *italic*, {key}; one paragraph per line). */
  name?: string;
  text?: string;
  /** Presentation only: a Vox card's Crisis box. */
  crisis?: string;
  /** Presentation only: the name, text and Crisis in other languages, by language code ("it"); missing parts fall back to the fields above. */
  i18n?: Record<string, CardWords>;
  /** Presentation only: centre of the picture's main subject, [x, y] as fractions of the picture (crops keep it in view). */
  artFocus?: [number, number];
}

export type SystemKind = 'gate' | 'planet';

export interface SystemDef {
  id: string;
  cluster: string;
  kind: SystemKind;
  /** Planets produce one resource when taxed. */
  resource?: Resource;
  /** Planet ID symbol (arrowhead | crescent | hexagon), used by campaign setup and Crises. */
  idSymbol?: string;
  /** Building slots on a planet (no limit when absent). */
  slots?: number;
  /** Presentation only: position on the map image, in image pixels. */
  pos?: { x: number; y: number };
}

export interface MapDef {
  systems: SystemDef[];
  /** Undirected adjacency. */
  links: [string, string][];
  /** Per player count: systems out of play and links closed. */
  exclusions: Partial<Record<PlayerCount, { systems?: string[]; clusters?: string[]; links?: [string, string][] }>>;
}

/** Starting setup slot letters: the setup card says where, the leader says what. */
export type SetupSlot = 'A' | 'B' | 'C';

/** Pieces placed on one setup slot. */
export interface SetupPieces {
  ships?: number;
  buildings?: ('city' | 'starport')[];
}

export interface Placement {
  system: string;
  /** Slot letter: pieces come from the seat's leader (or `defaultSetupPieces`). */
  slot?: SetupSlot;
  /** Explicit pieces, used when no `slot` is given. */
  ships?: number;
  building?: 'city' | 'starport';
}

/** A character card drawn at setup; it decides what goes on A, B and C. */
export interface LeaderDef extends PrintedWords {
  id: string;
  setup: Record<SetupSlot, SetupPieces>;
  /** Extra starting resources, if the leader grants any. */
  resources?: Resource[];
  /** Effect id of the leader's abilities (defaults to the leader id). */
  effect?: string;
}

/** Asymmetric starting layout. `seats[i]` is what seat i places. */
export interface SetupCardDef {
  id: string;
  playerCount: PlayerCount;
  seats: Placement[][];
  /** Extra exclusions printed on this setup card (beyond MapDef.exclusions). */
  exclusions?: { systems?: string[]; clusters?: string[]; links?: [string, string][] };
  /** Links this card opens (gates joined across an out-of-play area). */
  openLinks?: [string, string][];
}

export interface AmbitionMarkerDef {
  id: string;
  /** Side 0 (start) and side 1 (flipped): power for first and second place. */
  sides: { first: number; second: number }[];
  /** Flipped to side 1 in the cleanup after this chapter (absent = never flips). */
  flipAfterChapter?: number;
}

/** A die face: how many of each symbol it shows. */
export interface DieFace {
  hit?: number;
  selfHit?: number;
  buildingHit?: number;
  key?: number;
  intercept?: number;
}

export type DieType = 'skirmish' | 'assault' | 'raid';

export interface AmbitionMetricDef {
  /** 'resources': sum of the listed resources; 'captives' / 'trophies': counts. */
  kind: 'resources' | 'captives' | 'trophies';
  resources?: Resource[];
}

/** Prelude effect of spending one resource. */
export type PreludeRule =
  /** Take one action of one of these kinds. */
  | { actions: ActionKind[] }
  /** Take one action of the lead card's suit. */
  | { leadSuit: true }
  /** No action now: this turn the card also allows this kind. */
  | { grantKind: ActionKind };

/** Player board: resource slots, keys printed above them, and the cities that cover them. */
export interface PlayerBoardDef {
  /** Keys printed above each resource slot (index = slot). */
  slotKeys: number[];
  /** Slots open from the start. */
  baseSlots: number[];
  /** For the 1st, 2nd, ... city built (taken from the left): slots it uncovers. */
  cityUnlocks: number[][];
  /** For the 1st, 2nd, ... city built: power bonus per won ambition it uncovers (0 = none). */
  cityBonusPower: number[];
  /** Several uncovered bonuses: add them up, or use only the highest. */
  bonusMode: 'sum' | 'highest';
  /** A city returning to the board covers slots again: their tokens are lost, or moved to a free open slot. */
  cityReturnResource: 'lose' | 'move';
}

/** Everything that varies between games/editions. Owner-authored. */
export interface GameContent {
  handSize: number;
  chapters: number;
  powerToWin: Record<PlayerCount, number>;
  /** Player board layout: resource slots and the cities covering them. */
  playerBoard: PlayerBoardDef;
  agentsPerPlayer: number;
  shipsPerPlayer: number;
  citiesPerPlayer: number;
  starportsPerPlayer: number;
  courtSize: Record<PlayerCount, number>;
  /** suit id -> action kinds that suit grants. */
  suits: Record<string, ActionKind[]>;
  actionCards: ActionCardDef[];
  courtCards: CourtCardDef[];
  /** Card number -> ambition it declares (numbers missing here cannot declare). */
  declareByNumber: Record<string, AmbitionId | 'any'>;
  ambitionMetrics: Record<AmbitionId, AmbitionMetricDef>;
  /** Declaring takes the available marker worth most this chapter (first, then second place value). */
  ambitionMarkers: AmbitionMarkerDef[];
  maxDeclarationsPerRound: number;
  /** Ships placed in a gate by a player left with no ships and no starports (default 3). */
  rescueShips?: number;
  /** Surpassing with a card of this number also seizes the initiative (the 7s). */
  seizeOnSurpassNumber?: number;
  ties: {
    /** Tie for 1st: nobody gets 1st, tied players get 2nd. */
    firstTieDropsToSecond: boolean;
    /** Tie for 2nd: nobody gets 2nd. */
    secondTieAwardsNone: boolean;
  };
  /** Game-end tie: 'shared' victory, or 'turnOrder' = first tied player clockwise from the initiative holder. */
  gameEndTieBreak: 'shared' | 'turnOrder';
  /** Resource spent in prelude -> action kind it buys. 'any' = any kind of the current suit. */
  /** What spending each resource in the prelude does. */
  resourceActions: Record<Resource, PreludeRule>;
  /** Taxing a rival's city (requires controlling the system). */
  rivalTax: { allowed: boolean; effect: 'none' | 'takeCaptive' };
  dice: Record<DieType, DieFace[]>;
  /** Most dice of a single type in one battle (no limit when absent). */
  maxDicePerType?: number;
  map: MapDef;
  setupCards: SetupCardDef[];
  /** Leaders & Lore: leader cards. */
  leaders?: LeaderDef[];
  /** Leaders & Lore: lore cards (persistent powers resolved through the effect registry). */
  loreCards?: (PrintedWords & {
    id: string;
    effect?: string;
    /** Which box the card comes from (e.g. base game or an expansion pack). */
    set?: string;
    /** The card holds resources: slots on it and their raid cost. */
    holds?: { resourceSlots: number; keys: number };
  })[];
  /** Base game: pieces placed on A, B and C (the leaders variant uses each character card instead). */
  baseSetupPieces?: Record<SetupSlot, SetupPieces>;
  /** Resource tokens in the general supply, per type. */
  resourceSupply: Record<Resource, number>;
  /** 2 players: resources of out-of-play planets go on these ambition boxes. */
  twoPlayerAmbitionBoxes?: Partial<Record<Resource, AmbitionId>>;
}

// ------------------------------------------------------------------ state ---

export interface ShipStack {
  fresh: number;
  damaged: number;
}

export interface Building {
  owner: PlayerId;
  type: 'city' | 'starport';
  damaged: boolean;
  /** Built outside the planet's building slots by a card effect (does not use a slot). */
  outside?: boolean;
}

export interface SystemState {
  id: string;
  inPlay: boolean;
  ships: Record<PlayerId, ShipStack>;
  buildings: Building[];
}

/** A Rival piece taken as a trophy: whose it is and what it was (to return it in cleanup). */
export interface Trophy {
  owner: PlayerId;
  piece: 'ship' | 'city' | 'starport' | 'agent';
}

export interface PlayerState {
  id: PlayerId;
  power: number;
  hand: string[]; // action card ids
  /** Tokens by player-board slot: `resources[i]` is on slot i (null/undefined = empty). See board.ts. */
  resources: (Resource | null)[];
  supply: { agents: number; ships: number; cities: number; starports: number };
  /** Rival agents held as captives (owner id per agent). */
  captives: PlayerId[];
  /** Rival pieces destroyed (owner id per piece). */
  trophies: Trophy[];
  /** Secured faction court cards. */
  court: string[];
  /** Leaders & Lore: the player's leader card. */
  leader: string | null;
  /** Leaders & Lore: the player's lore cards (persistent powers; not stealable, no ambitions). */
  lore: string[];
  /** Outraged resource types: they cannot be spent for their prelude action. */
  outraged: Resource[];
  /**
   * Set when the player took or was given a resource, or a returning city
   * covered a slot: until their next other command they may rearrange their
   * tokens among the open slots (the `arrange` command).
   */
  arranging?: boolean;
  /**
   * Tokens gained with no open slot free: held aside while `arranging`, and
   * discarded to the supply at the player's next other command unless a
   * rearrangement gave them a slot (another token is then set aside instead).
   */
  overflow?: Resource[];
}

export interface CourtSlot {
  card: string;
  agents: Record<PlayerId, number>;
}

/** How a card was played in the current round. */
export type PlayMode = 'lead' | 'surpass' | 'pivot' | 'copy' | 'pass';

export interface Play {
  player: PlayerId;
  card: string | null; // null on pass
  mode: PlayMode;
  faceUp: boolean;
  /** Lead card zeroed by a declaration. */
  zeroed?: boolean;
  seized?: boolean;
}

export interface TurnBudget {
  player: PlayerId;
  /** Kinds allowed for the card actions. */
  kinds: ActionKind[];
  remaining: number;
  /** Cities taxed this turn (tax limit), as `system:owner:n` (n-th city of that owner there). */
  taxed?: string[];
  /** Ships built this turn per system (one per Loyal starport). */
  shipBuilds?: Record<string, number>;
  /** Set once a card pip is spent: the prelude (spending resources) is over. */
  preludeOver?: boolean;
  /** Resources spent in this prelude: they reach the supply only when the prelude ends. */
  spentInPrelude?: Resource[];
  /** Court cards secured during this prelude: their own prelude actions cannot be used in it. */
  securedInPrelude?: string[];
  /** Set by the first action, resource or card ability of the turn ("before any other actions" closes). */
  acted?: boolean;
  /** Once-per-turn abilities already used, as `card:ability`. */
  usedOnce?: string[];
  /** A move to take once the current battle is allocated (a leader's Copy/Pivot battle option). */
  afterBattleMove?: Record<string, unknown>;
}

/**
 * A choice the engine waits for outside the normal flow (design/gdd/card-effects.md
 * "Timing"): e.g. a Vox card's "when secured" effect. Queued in
 * `GameState.pendingDecisions` and answered with the `decide` command.
 */
export interface Decision {
  player: PlayerId;
  /** Content id of the card whose effect asks. */
  card: string;
  /** Which of the card's effects: 'whenSecured', or a trigger name. */
  effect: string;
  /** What the effect offers (e.g. cards drawn to choose from). */
  data?: Record<string, unknown>;
}

export type Phase =
  | { type: 'draft' } // Leaders & Lore: players pick leader and lore cards (state.draft)
  | { type: 'lead' } // waiting for the initiative holder to lead
  | { type: 'follow'; next: PlayerId } // waiting for `next` to follow
  | { type: 'actions'; budget: TurnBudget } // `budget.player` is taking actions
  | { type: 'allocate'; battle: BattleRef; budget: TurnBudget } // attacker allocates hits, then back to actions
  | { type: 'decide'; decision: Decision; resume: Phase } // a card effect waits for `decision.player`, then `resume`
  | { type: 'gameOver'; winners: PlayerId[] };

/** A rolled battle waiting for allocation (design/gdd/core-loop.md §3.5, card-effects.md "Battle"). */
export interface BattleRef {
  attacker: PlayerId;
  target: PlayerId;
  system: string;
  /** Symbols to resolve: the rolled faces plus card modifiers (e.g. an added intercept). */
  totals: { hit: number; selfHit: number; buildingHit: number; key: number; intercept: number };
  /** Hits the attacker's ships take from intercept. */
  interceptHits: number;
  /** Each die rolled, in order (rerolls replace entries). */
  faces?: { type: DieType; face: DieFace }[];
  /** Fresh defending ships when the dice were rolled (intercept deals one hit each). */
  defenderFresh?: number;
  /** Every attacking ship was fresh when the battle started. */
  attackerAllFresh?: boolean;
  /** Reroll abilities already used in this battle (each once). */
  rerolls?: string[];
  /** "Like in a battle": battle rules, but battle modifiers and triggers do not apply. */
  like?: boolean;
  /** Trophies the attacker held before the allocation (after-battle triggers compare). */
  trophiesBefore?: number;
}

/** A battle started but waiting for reactions before the attacker collects dice. */
export interface BattleSetup {
  attacker: PlayerId;
  target: PlayerId;
  system: string;
  /** The dice the attacker asked for; may be changed when collecting. */
  dice: Partial<Record<DieType, number>>;
  /** Every attacking ship was fresh when the battle started. */
  attackerAllFresh: boolean;
}

export interface RoundState {
  leader: PlayerId;
  leadSuit: string | null;
  plays: Play[];
  declarations: number;
  seizedBy: PlayerId | null;
  /** Guild cards placed next to a played action card: at round end the owner takes that action card into hand. */
  attached?: { guild: string; owner: PlayerId; actionCard: string }[];
}

export interface AmbitionBoard {
  /** ambition -> marker ids placed on it this chapter. */
  declared: Record<AmbitionId, string[]>;
  /** Marker ids still available, ordered high -> low. */
  available: string[];
}

export interface LogEntry {
  chapter: number;
  text: string;
  data?: unknown;
}

export interface GameState {
  playerCount: PlayerCount;
  /** Base game or leaders (character cards) variant. */
  variant: 'base' | 'leaders';
  /** Resource tokens left in the general supply. */
  resourceSupply: Record<Resource, number>;
  /** 2 players: tokens placed on ambition boxes at setup. */
  ambitionBoxes: Partial<Record<AmbitionId, Resource[]>>;
  /** 2 players: who may still redraw the first hand (null = nobody). */
  mulligan: PlayerId | null;
  /** Initiative passes in a row; all players with cards passing ends the chapter. */
  consecutivePasses: number;
  /** Leaders & Lore draft in progress: face-up rows and the remaining pick order. */
  draft: { leaders: string[]; lore: string[]; order: PlayerId[]; lorePerPlayer: number } | null;
  seed: number;
  /** Internal mulberry32 state, so the RNG lives inside the JSON state. */
  rngState: number;
  chapter: number;
  initiative: PlayerId;
  players: PlayerState[];
  deck: string[];
  /** Action discard pile, bottom first (the last card is the top). */
  discard: string[];
  /** Action cards in the discard that went there face down (copied, seized with, discarded hands): card -> who put it there. Only they may look at it. */
  discardHidden?: Record<string, PlayerId>;
  courtDeck: string[];
  /** Cards put in the Court deck in secret (campaign): nobody may see they are there. */
  courtDeckSecret?: string[];
  /** Court discard pile, bottom first. */
  courtDiscard: string[];
  court: CourtSlot[];
  map: Record<string, SystemState>;
  closedLinks: [string, string][];
  /** Extra links opened by the setup card. */
  openLinks: [string, string][];
  ambitions: AmbitionBoard;
  round: RoundState;
  phase: Phase;
  setupCard: string;
  /** Card effects waiting for a choice, resolved in order after the current command. */
  pendingDecisions?: Decision[];
  /** A battle waiting for reactions before dice are collected. */
  battleSetup?: BattleSetup | null;
  /** Planets whose type a card changed for good (system id -> new type). */
  planetTypes?: Record<string, Resource>;
  /** Lore cards discarded by their own effects (out of the game). */
  loreDiscard?: string[];
  log: LogEntry[];
}
