# War System & Troop Training — Design (grounded for the current build)

> Supersedes the parked `war-system-design.md` for *implementation*. Keeps its
> principles, but adapts them to what we actually built and to how proven games
> (Catan: Cities & Knights, Risk, RTS counter systems) handle troops + combat.

## Reconciling with the model we actually have
The parked notes assumed "own tiles / we-go rounds." Our shipped game is different,
and the war layer must fit it:
- Players **don't own tiles** — they own **buildings on vertices** (settlements/cities)
  and **roads on edges**. Production comes from buildings next to a rolled number.
- The game is **turn-based** (not simultaneous).
- So **war targets an enemy *building*** reachable through your road network — not a
  "tile." Conquest = that settlement/city is **razed or captured**. This is a real
  points + production swing, exactly the "conquest is a swing, not just a land-grab"
  goal from the parked doc.

## What the research tells us (and how we apply it)
- **Cities & Knights** → troops are a *standing*, visible force you invest in over time
  and must *pay to keep effective*. We mirror this: soldiers are trained with resources,
  sit in your army, and cost upkeep-ish to raise. (Sources at bottom.)
- **Counter-triangle** → keep the 5-unit roster (Knight/Archer/Cavalry/Catapult/Spearman)
  as the *eventual* depth, but **don't build it first**. Balance the triangle before cost.
- **Risk** → abstract combat = compare strength + dice, **defender wins ties**, war costs
  troops (attrition). Great fit for a clean v1 that isn't "a second RTS."

## Core principle (unchanged, and the balance North Star)
**War is worth it only when conquest pays better than building.** Every number below is
tuned to that: an army big enough to take a city should cost about what a city costs, and
losing a war should hurt. Peaceful victory stays a complete path.

---

## v1 — "First heartbeat of war" (smallest buildable slice)
Deliberately abstract (no battle screen, no 5-unit roster yet), per the parked doc's own
"abstract war first" guidance.

### Troops (training)
- New unit: **Soldier** (single abstract troop; the counter-triangle comes later).
- **Train cost: 1 ore + 1 wheat** per soldier (ore = "iron/weapons", wheat = "feeding
  troops" — mirrors C&K's build+activate split). One action, on your turn, in main phase.
- Your **army strength = number of soldiers** you hold (shown on your player panel).
- **Cap:** soldiers ≤ 2 + (your cities × 1) + (your settlements × ...) — i.e. your army
  is gated by your economy so you can't stockpile infinitely. (Start: cap = 1 per
  settlement + 2 per city. Tune in playtest.)
- Soldiers are **visible** (count shown to all) — armies leak strength like big cities do.

### Declaring war (the "proper" way)
- **Adjacency gate:** you may attack an enemy **settlement/city that touches your road
  network** (a vertex reachable from your roads). Geography decides who you *can* fight.
- Declaring is a turn action that opens a **defender response** (see below), then resolves.

### Defender options (before battle) — DECIDED
- **Fight** — resolve combat.
- **Peace treaty** — give the attacker resources (and/or terms) to call it off.
- **Retreat** — abandon the contested building **without a fight**; surviving soldiers
  fall back to a **road-connected** friendly building (see Connectivity). If the building
  is isolated (no connected friend), you can't cleanly retreat — fight or lose the garrison.

### Combat (auto-resolve, abstract)
- `attackTotal = attackerArmy + d6`
- `defendTotal = defenderArmy + defenseBonus + d6`, where
  `defenseBonus = 1 (home) + 1 per friendly city adjacent to the target` (+ future walls).
- **Higher total wins; tie → defender** (Risk-style defensive edge).
- **Casualties:** loser loses 2 soldiers (down to 0); **winner loses 1** (war is costly).

### Conquest = CAPTURE (decided) + the connectivity consequences
- **Attacker wins:** the target building is **captured** — ownership flips to the attacker,
  who gains its VP + production. The defender does **not** lose everything; they lose *that
  building* and can fall back.
- **Defender wins:** attacker's army is reduced; defender keeps the building (attacker is
  now weak → open to a counter).
- **Set back, not out:** you take one building at a time, never the whole player outright.

## Connectivity / supply lines (the core geography mechanic) — DECIDED DIRECTION
A player's buildings split into **clusters** = connected components of *their own* roads
(we already compute this graph for Longest Road). A cluster behaves like a little kingdom:
- **Retreat:** when a building falls/abandons, its soldiers fall back to other buildings in
  the **same connected cluster**. Soldiers in an **isolated** building have nowhere to go.
- **Troop transport:** soldiers move **freely within a cluster** (fast). Moving between
  **disconnected** clusters is **slow or impossible** (must build road to link them, or a
  multi-turn "march" — exact rule TBD in playtest).
- **Counter-attack:** because a captured building often still touches the former owner's
  roads, **regaining it later just uses the normal attack rules** — no special case needed.
- **Splitting:** capturing a building that linked two parts of a network can **cut** the
  defender's cluster in two, isolating the far side. Emergent and nasty — exactly the
  strategic depth we want. Balance via playtest.

**Open mechanic — where soldiers "live"** (affects model + UI), see decisions below.

---

## Balancing method (how we keep it fair)
1. **Counter-triangle first (later layers):** when we add the 5 units, balance what each
   *beats/loses to* before touching numbers. Any new unit must name both.
2. **Cost + build-time for fine-tuning only**, never to fix a dominant strategy.
3. **The economic check:** periodically compare "resources spent on an army that wins a
   war" vs "VP/resources from spending the same on building." They should be close, with
   war slightly *riskier* (dice + attrition) so it's a real choice, not the default.
4. **Playtest levers (cheap to tweak):** train cost, army cap, defender bonus, casualty
   counts, and whether conquest captures or razes.

---

## Decisions locked
- **Standing army** (visible, persistent).
- **Conquest = capture** (ownership flips), with **retreat / peace / fight** defender options.
- **Abstract single Soldier first**; 5-unit roster + battle screen later.
- **Connectivity model**: clusters drive retreat, transport, and counter-attack.

## Still open (small, see chat)
1. **Where soldiers live:** one **per-cluster pool** *(recommended — simplest that still
   makes connectivity matter)* vs **per-building garrison** (granular, more UI) vs **one
   player pool** (simplest but connectivity barely matters).
2. **Build order:** ship the basic war *loop* first (train → declare → fight → capture)
   then layer the connectivity rules *(recommended)* vs build connectivity in from day one.

## Layering roadmap (after v1 ships and is fun)
- v2: **Ambush** (skip declaration, costs more, no defender prep — needs a range leash).
- v2: **Walls/fortifications** (defense bonus you can buy).
- v2: **Bonus transfer** on conquest (Longest Road / Largest Army swing).
- v3: the **5-unit counter-triangle** + a simple **battle screen** (auto-resolve first).
- v3: **espionage / hidden point totals** (anti-leader-pile-on).

## Sources
- Catan: Cities & Knights rules — https://officialgamerules.org/game-rules/catan-cities-and-knights/ ,
  https://en.wikipedia.org/wiki/Catan:_Cities_%26_Knights
- RPS / counter design — https://www.gamedeveloper.com/design/rock-paper-scissors-design-in-strategy-games ,
  https://waywardstrategy.com/2021/07/27/hard-counters/
- Risk combat — https://www.ultraboardgames.com/risk/game-rules.php , https://risk.fandom.com/wiki/Dice_Rolls
