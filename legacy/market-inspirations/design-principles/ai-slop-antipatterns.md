# The AI-slop checklist

*Distilled from a YC design review with Raphael Schaad (co-founder of Cron, acquired by
Notion) and the YC design team, walking through six YC startup landing pages built with
AI tools. Full transcript in [`sources/yc-design-review-ai-trends.md`](sources/yc-design-review-ai-trends.md).*

**This is a pre-ship gate for the Solum marketing site.** Before the site goes live,
every line below gets checked. The point is not that these techniques are inherently
bad. It is that they are now so ubiquitous that they read as "nobody made a decision
here," which is the exact opposite of what a feasibility tool selling defensibility
needs to project.

## The core diagnosis

LLMs are trained on the good websites that got linked to a lot. So a trend that used to
take a year to spread now shows up on every startup site the following week. The result:
techniques that were once a signal of craft are now a signal of *absence* of craft.

Two lines from the review worth keeping in front of us:

> "Just because something is possible doesn't mean you should say yes to it."

> "You're now the editor."

And the commercial consequence, which is the real reason to care:

> "You lose a little bit of credibility when your customers are viewing your product and
> they're saying, this looks like a bunch of other things I've seen. They probably just
> used AI to build this. If that's the case, how good is the actual product?"

For Solum that risk is sharper than for most. We are selling a tool whose entire promise
is that its numbers are defensible. A landing page that looks auto-generated undermines
the product claim directly.

## Banned outright

- **Purple gradients.** The single most-cited tell. Named in four of six sites reviewed.
- **Scroll jacking.** Hijacking native scroll to drive animation. Described repeatedly as
  "molasses." Also destroys the scroll indicator, so the visitor cannot tell how far
  through the page they are.
- **A line that follows you down the page.** SVG path drawing tied to scroll position.
  "I'm paying more attention to the line than the things it wants me to pay attention to."
- **Buttons that chase the cursor.** "I'm not paying attention to what they do. I'm just
  wondering why this button is following me around."
- **Fade-in-on-scroll for whole sections.** Scrolling *is already* the motion. Worse, it
  breaks on fast scroll: the reviewers hit an FAQ that appeared to contain one question
  because the rest had not faded in yet.
- **Hover effects that make things fade out or disappear.** Backwards. The browser already
  gives you a hand cursor for free. If you add a hover state, make it *pop* — one shade
  brighter, a subtle glow — never recede.
- **Hover that reveals essential information or functionality.** No mobile equivalent
  (long-press never caught on because it is undiscoverable), and it forces users to hunt
  around the interface. Fine for making a UI feel alive, wrong for anything load-bearing.
- **Emoji used as icons.** "Immediately a tell." LLMs reach for them because they have no
  IP of their own.
- **Fake dashboards with red/yellow/green/blue callout icons.** The Google-primaries
  palette on a mock analytics panel. "Every fake dashboard looks basically like that."
- **Meteors, shooting particles, cursor-following edge glows.** Costless to add, which is
  the only reason they exist.
- **Made-up stats.** "10x deal volume, 10x everything" reads as invented. If we cannot
  source a number, we do not print it.
- **"Scroll down to see more" labels.** "Of course we're on a website. Of course I know
  how to scroll."

## Structural mistakes to avoid

- **Too many type styles.** One reviewed site had five levels competing in the hero: logo,
  an invented eyebrow label, H1, subtext, and a badge. LLMs add a "clever" extra label
  that adds vertical space and muddies hierarchy without adding information. Solum's rule:
  **two families, four sizes, no invented fifth style.**
- **Visual language changing between sections.** Sections that look like they came from
  different sites, because different parts were generated separately.
- **Multiple button shapes in one component.** Pill, then circle, then rounded rect, all
  in the same carousel.
- **Auto-advancing carousels that also swallow clicks.** Some elements clickable, some
  not, with no visual difference. Chevrons that appear inconsistently.
- **Navigation unreadable over a video or dynamic background.** A nav that adapts to a
  static background but breaks over video.
- **A hero that fills exactly 100% of the viewport.** Better to let a sliver of the next
  section peek above the fold. It invites the scroll without a label telling you to.
- **Blurry or low-res assets**, especially video poster frames.
- **A poster image that leads into a completely different video.**

## What the reviewers actively praised

Worth copying, because these are the same superpowers used well:

- **Card hover animations that reinforce the message.** The example: two game controllers
  with lightning connecting them, illustrating multiplayer. Expensive before AI, cheap
  now, and it carries meaning. "It helps establish the brand and it's unique and it
  actually reinforces the point."
- **Hover that shifts a monochrome button into the brand colour.** Simple, correct.
- **A genuinely interactive demo embedded in the page.** They played a real 3D game in
  the browser. The one criticism: the site never told them what they were playing or that
  it was made with the product. **Label your demo.**
- **An H1 that answers three things plus a CTA, above the fold:** what is it, who is it
  for, and to what end. If those are not above the fold, conversion suffers.

## How to actually use AI here

The recommended order is the opposite of the default:

> "Rather than start from what the AI spits out and then tweak that, I would start from
> what colour palette do we want and what is our brand, and feed that into the system."

Then spend the time saved on messaging and originality rather than on shipping the first
output. And QA everything by hand:

> "If this was hand-coded, no way someone would have not noticed it. If you one-shot
> landing pages, do you actually go and really use it with the same attention to detail
> as if you had built it from scratch?"

Finally, the framing that should govern every decision on this page:

> "This is not your product. This is not a website as in a cool thing on the web. These
> are startup landing pages and they're customer acquisition channels."

## The Solum test

Before shipping, every animation and effect on the site must answer yes to:

1. **Would I hand-code this for a week?** If no, cut it. That is the whole filter.
2. **Does it carry information, or is it decoration?** Decoration that costs attention is
   a net negative.
3. **Does it survive a fast scroll?** No content may be invisible to someone scrolling
   quickly.
4. **Does it work without hover?** Nothing essential behind a hover state.
5. **Could this be on any other startup's site?** If yes, it is not ours.

And one Solum-specific test, because of what we sell:

6. **Does it make the numbers more believable, or less?** A page selling defensible
   feasibility cannot afford anything that reads as unconsidered.

Note that Solum starts in a good position on the biggest tell: we are not choosing a
palette from scratch, we already own cream, `#FF6B19` orange, and graphite from the app.
Starting from an existing brand rather than from an AI default is precisely the advice
given above.
