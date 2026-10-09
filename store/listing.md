# Store listing

Copy for App Store Connect and the Play Console. Limits are in brackets; every
field below fits. Screenshots and the Play feature graphic are in this folder
(`node tools/store-shots.mjs` regenerates them from the current game). The Play
icon is `assets/icon-512.png`.

Nothing here mentions price or ads. The stores add "Contains ads" and
"In-app purchases" labels on their own, so this copy works for any pricing.

## Both stores

**App name** [30]: The Apple: Snake in Reverse

**Category:** Games → Arcade (App Store secondary: Puzzle)

## App Store only

**Subtitle** [30]: Be the apple. Trap the snakes.

**Keywords** [100]: snake,arcade,puzzle,casual,reverse,strategy,retro,dodge,trap,brain,family,offline,levels,daily

**Promotional text** [170]: A new Daily Run every day, the same levels for everyone. How long can you last as the apple?

## Google Play only

**Short description** [80]: Snake, flipped: you're the apple. Trick hungry snakes into crashing!

## Description (both) [4000]

Snake, flipped. For once, you're the apple.

Hungry snakes are hunting you. You can't fight back, but you can outsmart them: lead them into walls, rocks, thorny brambles, each other or their own tails. Just don't get eaten.

• 100 levels across 10 worlds, from Sunny Orchard to Volcano Rim and Cloud Garden. Each level has its own layout and goal: crash every snake, survive the clock, collect stars or take down the golden snake.
• Snakes that get smarter. Later snakes cut you off, team up to flank you, and rear back before they lunge, so watch for the "!".
• Tricks up your peel. Dash out of trouble, drop Brambles to build traps, and use Hidden Rot to give a snake a bellyache it won't forget.
• Rising hunger. The longer a level lasts, the faster the snakes get and the more the hedges close in.
• Nerve. Slip right past a snake's nose to multiply your score, up to ×6.
• Your nemesis. In Endless mode, the snake that ends your run remembers you and comes back stronger.
• A new Daily Run every day, the same for everyone, plus three daily challenges.
• The Orchard. Spend your stars on upgrades and apple skins.
• Sprout mode for younger players, and Rotten Core for experts.
• Plays offline. Optional sync carries your progress between your phone, tablet and computer, with no account.

Easy to pick up, hard to master. Fun for kids and grown-ups.

## What's new (version 1.0)

The Apple is here! 100 levels, a Daily Run every day, and plenty of snakes to outsmart.

## Screenshots

Upload them in this order. Each set is at the exact size its store asks for.

| File | Caption |
|---|---|
| `1-play.jpg` | Snake, flipped. You're the apple! |
| `2-trap.jpg` | Trick snakes into walls, thorns and their own tails |
| `3-map.jpg` | 100 levels across 10 worlds |
| `4-daily.jpg` | A new Daily Run and challenges every day |
| `5-orchard.jpg` | Upgrade your apple, collect skins |

- `screenshots/iphone-6.9/` (1320 × 2868): App Store, iPhone 6.9" display.
- `screenshots/ipad-13/` (2064 × 2752): App Store, iPad 13" display. Only needed if the app supports iPad.
- `screenshots/android-phone/` (1080 × 1920): Google Play, phone.
- `feature-graphic.jpg` (1024 × 500): Google Play feature graphic.

## Contact and links

All on mattlavergne.com, because AdMob checks `app-ads.txt` on the website the listing names (https://mattlavergne.com/app-ads.txt).

- **Support email:** contact@mattlavergne.com
- **Support URL:** https://mattlavergne.com/privacy/apple#contact
- **Privacy policy URL:** https://mattlavergne.com/privacy/apple
- **App Store marketing URL:** leave empty (it's optional, and mattlavergne.com/apple is your private test site)
- **Google Play website:** https://mattlavergne.com

## In-app purchase (both stores)

- **Product ID:** `com.mattlavergne.theapple.full` (permanent; must match `js/monetization.js`)
- **Type:** Non-consumable (App Store) / one-time product (Google Play)
- **Price:** $2.99
- **Display name:** Full Game
- **Description:** All 100 levels, Endless mode and no ads.
- **Review screenshot (App Store):** `iap-review.png`
- **Review note (App Store):** Tap Endless on the title screen, or level 21 on the map, to see the purchase screen. Restore purchase is on that screen and on How to play.
