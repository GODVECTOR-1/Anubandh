@AGENTS.md

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

## Gates

Every change must leave these green. Run `npm run check:all`, or individually.

Nothing below needs a credential. With no `DATABASE_URL` the app falls back to
an in-process store and the samples carry pre-baked analyses, so the whole
suite — browser gates included — runs against a real production build with no
database and no Gemini key. `.github/workflows/ci.yml` runs exactly this on
every push. The only value CI sets is a placeholder `SESSION_SECRET`, because
`lib/session.ts` refuses to start in production without one.

| Command | What it proves |
|---|---|
| `npm test` | Two passes. `test:server` covers the pure, security-critical logic — session cookie forgery and tampering, rate-limit keying and windows, the offset map every citation depends on, the job retry rule, error mapping. `test:components` renders the surfaces that make a claim to the reader and asserts severity can never arrive as colour alone, and that a loose match never reads as "Verified". They are separate because `server-only` needs the react-server condition and `react-dom/server` refuses to load with it. `test:coverage` enforces thresholds on the server pass |
| `npm run check:backend` | 43 assertions: RLS actually enforced, wrong-owner reads 404 and not 403, cookie attributes, the purge, rate limiting wired to the route, a retry reusing the extraction it already paid for, and the pipeline invariants. Skips the RLS checks loudly when `DATABASE_URL` is unset rather than passing them by default |
| `npm run check:secrets` | No `NEXT_PUBLIC_`, no `process.env` in a client module, no env file committed, no credential shapes in source |
| `npm run check:routes` | Every route 200, no console errors, no failed requests, upload flow completes, `/api/prepare` returns a valid PDF |
| `npm run check:contrast` | 44 token pairs clear WCAG AA, measured from `globals.css` in both the page and card contexts |
| `npm run check:backdrop` | Text photographed against the real gradient, photo and glass, then scored against the worst pixel in its own box |
| `npm run check:a11y` | axe on every route, 44px targets, keyboard paths, reduced motion, no horizontal scroll |
| `npm run check:hero` | Contrast over the hero photograph at four widths |
| `npm run check:budget` | Per-route JS weight over the wire. Needs a production server: `npm run build && npx next start -p 3100`. It measures the minified bundle, so dev numbers would be meaningless |

Database changes live in `supabase/migrations/`, applied with `npm run migrate`.
A gate that needs a table you have not migrated fails open and says so in the
server log rather than taking the route down.

`contracts/schema.ts` is the frozen contract. Changing it changes both sides of the app at once, so treat an edit there as an interface change, not an implementation detail.
