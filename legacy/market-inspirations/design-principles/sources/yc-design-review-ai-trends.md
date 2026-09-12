# Source — YC design review: AI design trends

**Format:** YC design review video, transcript supplied by DKubadia.
**Participants:** YC design team host + **Raphael Schaad**, YC visiting partner,
co-founder of Cron (calendar tool, acquired by Notion).
**Subject:** six YC startup landing pages built with AI coding tools, reviewed live.

> **Note on fidelity.** This is an *edited* record of the transcript, organised by site
> and by theme, preserving the substantive observations and direct quotes. Filler,
> crosstalk, and repetition have been removed. The distilled, actionable version is in
> [`../ai-slop-antipatterns.md`](../ai-slop-antipatterns.md), which is the document we
> actually hold the Solum site against.

---

## How the trends spread (the origin of the problem)

Schaad's account of why this happened, which is the useful mental model:

> "This all started when I had a late night thought and tweeted that I see a lot of dumb
> hover effects on landing pages of startups these days, presumably vibe coded. So I was
> curious to peel the layer back. How did these, what I thought were dumb effects, make
> it into LLMs and why are they everywhere?"

> "When there was a good website establishing a trend, it took a while in the old world
> for others to copy these trends. But now with LLMs, if there's a good website with a
> purple gradient, it makes it into the LLM because the LLM gets trained on the good
> examples that get linked to a lot. And then the next week, all the startup websites
> look the same."

Host, on why this is not a moral claim about any single technique:

> "It's not that those inherently are bad. It's not purple gradients are bad, nobody
> should ever use them. It's that now they're so ubiquitous everywhere that they lose all
> meaning and specialness and originality."

---

## Site 1 — Nuu.ai (AI agents for game QA)

**Purple gradient.** First thing both reviewers named.

> "Pre, I looked at this and went, wow, this looks really nice. And now I look at it and
> I'm like, they used AI to design this."

**The line that follows you down the page.**

> "I'm paying more attention to the line than I am the things that I think it wants me to
> pay attention to."

> "It's almost something that's hard to implement for a human. You would have never
> thought to code this up before AI. Just because LLMs are good at these SVG buildups or
> transforms doesn't mean it's a good design or helps you convert visitors into
> customers."

**Praised: the card hover animations.** Two game controllers with lightning connecting
them, illustrating multiplayer.

> "This is a pretty tasteful way of leveraging the powers of LLMs to build more compelling
> websites."

> "It helps establish the brand, and it's unique and creative and fun, and it actually
> helps reinforce the points they're trying to make."

**Nav hover that fades out.**

> "Generally you want to make things pop, but here it actually disappears. So instead of
> inviting a click, it goes into the background. This is something a designer would almost
> never choose to do."

> "The browser already has a built-in hover effect for free even without CSS. It turns the
> cursor into a hand. So that already indicates I can click here. If you want to add a CSS
> effect, make it pop, one shade lighter, add a little glow. Don't make it go away."

**On hover-to-reveal as an anti-pattern:**

> "Hover is great to make UIs feel more alive. But I see it increasingly used to disclose
> additional critical information or functionality, and I don't think that's the best use."

> "I don't want my computer to be just all content. I want it to be a bicycle for the
> mind, the tool. Revealing functionality only on hover, so you have to go hunt for what
> the tool can do, is an anti-pattern."

Plus: no hover on mobile, and long-press never caught on because it is undiscoverable.

---

## Site 2 — Rosebud AI (create games with AI)

Purple gradient again, plus a pinkish-purple accent, on a **red logo** — a clash nobody
would choose deliberately.

**Praised: the playable in-browser demo.** They actually played a 3D game on the page.
The criticism was that the site never explained it:

> "It doesn't say, play a game made with our product right now."

**Emoji as icons:**

> "Whenever I see the use of emojis, I feel like it's a little lazy. LLMs take the easy
> path because they don't have any IP themselves. They use these standard icons everywhere
> and it's immediately a tell."

**On what an H1 must do:**

> "What's important for the H1 is what is it, who is it for, and to what end — why should
> that person care. If those three things plus a call to action are not above the fold,
> it's a harder time to convert visitors."

---

## Site 3 — Get Crux (AI creative strategist for ads)

**Scroll jacking**, **auto fade-ins**, and **a button that chases the cursor.**

> "I'm so distracted by the button that's chasing me around the screen. I almost feel like
> it's hard to click on it because it's constantly moving."

> "It makes me distracted. I'm not paying attention to what they do."

**Meteors shooting from the corners:**

> "It doesn't feel like it adds value. If you had to build that from scratch it would
> never be worth your time. But it's so easy that people say, yeah, let's throw that in."

**Fade-ins breaking on fast scroll** — the reviewers hit an FAQ that appeared to have a
single question:

> "I was like, wow, that's a lame FAQ if there's only one Q and one A. But then, aha, it
> just hasn't come in yet."

> "Why does it have to fade in? Scrolling already is the motion."

**Blurry poster image** leading into a different video. **Inconsistent visual language**
between sections. And the damning summary:

> "We're halfway down the page right now, and if you asked me what they did, I would not
> be able to tell you."

---

## Site 4 — Sphinx (compliance)

**Too many type styles in the hero** — logo, an invented eyebrow label, H1, subtext, badge:

> "Somehow the LLM thought it was clever to have an extra label here in an extra style.
> But we already have the company name, we already have three different styles. This just
> adds a fifth, complicating the hierarchy, not really adding."

**Buttons changing shape mid-carousel**, auto-advancing, with a fake affordance:

> "It's actually not a button. Yes, it shows the hand, but that's a head fake."

> "It feels like the visual manifestation of LLM hallucinations."

**Scroll jacking destroying the scroll indicator:**

> "If you have a physical book, you're kind of like, oh, halfway through. Here I don't
> know. The scroll indicator is a really important tool to get a grasp on the landing page,
> and here it's completely failing me."

**Animation stealing attention from the message:**

> "The animation is getting all of my attention rather than what it says over on the left
> side. So I miss everything over here. The animation is too distracting."

Positively noted: the H1 explains what it is and who it is for, and the orange accent
on black is consistent with the product UI.

---

## Site 5 — Build Zero (internal apps with AI)

Purple gradients. **Dumb hover effects** (vertical movement, arrow moving *backwards*,
a hover that horizontally shifts the whole menu — reads as a bug). One hover approved:
monochrome button turning brand-colour.

**A selection bug in an interactive element**, which prompted the key QA observation:

> "If this was hand-coded, no way someone would have not noticed it. I wonder, if you just
> one-shot landing pages, do you actually go and really use it with the same attention to
> detail as you would if you had built it from scratch? And because you don't, you ship
> things that you wouldn't have, because you don't even notice the little bugs the LLM
> made."

**The fake dashboard:**

> "Every fake dashboard looks basically like something like that." Red/yellow/green/blue
> Google-primaries callouts, icons in a darker shade of their own light background.

**Bento boxes:**

> "Not a bad pattern, but also very non-original. LLMs oftentimes come up with these, just
> icon at the top and a bit of text, in a 3x2."

Schaad's summary of the opportunity being wasted:

> "The really cool thing about AI tools is that it frees you from fiddling with the
> technical details, so you can really work on the hard questions of your offering, your
> product, your company. What are we making, for whom, why is this valuable to them. But
> if you just use it to create AI slop, this idea of having all this power that you should
> use responsibly gets wasted. That's the fine line to walk for builders in 2026."

> "Use AI to build this by any means. But then really evaluate the output, and use AI to
> make it even better and more original, and spend the time that you saved one-shotting it
> to really think about your messaging."

---

## Site 6 — Zarna (AI associates for private capital markets)

**Scroll jacking** plus **invented statistics**:

> "10x deal volume, 10x everything, all the things. This all just feels made up."

> "It feels like I have to scroll through this molasses forever to get to anything that
> helps me understand what this is."

**Hero filling 100% of the viewport** — Schaad's preferred alternative:

> "Right now the background uses 100% of the vertical space, which visually locks me in
> and then there's nothing more. One of the things I personally like, to interrupt the
> visual a little bit, is maybe like 10 pixels of an awesome hero image peeking up. And
> then without any indicators I know there's more good stuff down here and want to scroll
> down and discover it."

> "I hate when people put 'scroll down to see more', because of course we're on a website.
> Of course I know how to scroll down."

**Nav unreadable over video.** The nav adapted to static backgrounds but broke over video.

**Inconsistent clickability** — some nested items clickable, some not, chevrons appearing
inconsistently, elements jumping on their own timer.

---

## Closing takeaways

Schaad:

> "You are still responsible to not outsource your thinking to LLMs, and actually just use
> them as tools to get your brilliant ideas, designs, novel interactions out on the web to
> dazzle your customers. That's what a landing page should do in the end. It's a customer
> acquisition channel. This is not your product. This is not a website as in a cool thing
> on the web. There's space for that as well, but these are startup landing pages."

Host:

> "QA everything. It's very easy to create something, but ultimately you the founder, you
> the human, need to be the one that goes through and makes sure the interactions work
> right."

> "It's very easy, using the same tools that everybody else is using, to end up in the
> same place. You have to be intentional about ending up in a different place. Rather than
> start from what the AI spits out and then tweak that, I would start from what colour
> palette do we want to use and what is our brand, and feed that into the system, and use
> that to make sure we end up at an end goal that represents us."

On the credibility cost, which is the reason this matters commercially:

> "You lose a little bit of credibility when your customers are viewing your product and
> saying, this looks like a bunch of other things I've seen. They probably just used AI to
> build this and design it. If that's the case, how good is the actual product? Or are they
> vibe coding that too?"
