Yes. At this point, I would freeze the concept as a **single-clan private eFootball Mobile competition platform** and write the specification as if a developer is going to build it from zero.

The important change from our earlier versions is that the system is **not multi-clan**. There is one clan, one community, one member database, and many competitions/seasons over time.

For the first implementation, I recommend **React + TypeScript + Vite + PWA + Supabase**. Supabase is particularly suitable here because it provides PostgreSQL, Auth, Storage, and Realtime in one service, and its current Free plan includes 500 MB database storage, 1 GB file storage, 5 GB egress, 50,000 MAU, 500,000 Edge Function invocations, 2 million Realtime messages, and 200 peak Realtime connections. ([Supabase][1])

Below is the complete specification.

# eFootball Clan Management & Competition Platform

## Complete Software Requirements & Development Specification

**Version:** 1.0
**Application type:** Private Progressive Web Application
**Target platforms:** Android, iOS, Desktop Web
**Primary purpose:** Manage one eFootball Mobile clan, its members, leagues, cups, tournaments, matches, rankings, statistics, history, and internal community.

---

# 1. Product Definition

## 1.1 Concept

The application is the official digital management platform for one eFootball Mobile clan.

It allows clan members to:

* View clan information
* View members
* Participate in competitions
* Join competitions through invitation links/codes
* View fixtures
* Play matches
* Submit results
* Upload match evidence
* Confirm or dispute results
* Track match deadlines
* View league standings
* View tournament brackets
* View player statistics
* View historical seasons
* Receive notifications
* View clan announcements
* View clan records and Hall of Fame

Administrators can:

* Manage clan members
* Create competitions
* Define player capacity
* Define registration deadlines
* Generate invitation codes
* Generate invitation links
* Control competition registration
* Generate fixtures
* Manage match deadlines
* Replace players
* Resolve disputes
* Modify results
* Manage announcements
* Manage clan settings
* View audit logs

---

# 2. Core Principle

The application is designed around one main loop:

```text
Player opens app
        ↓
Sees next match
        ↓
Sees deadline
        ↓
Plays eFootball
        ↓
Submits result + screenshot
        ↓
Opponent confirms
        ↓
Standings update automatically
        ↓
Statistics update
        ↓
Next match appears
```

This should be the primary user experience.

---

# 3. Scope

## 3.1 Included in V1

### Authentication

* Login
* Logout
* Password reset
* Invitation-based account creation
* Session persistence

### Clan

* Clan profile
* Clan logo
* Clan banner
* Clan rules
* Members
* Roles
* Member status

### Competitions

* League
* Cup
* Tournament
* Special event

### Registration

* Registration start
* Registration deadline
* Maximum participants
* Minimum participants
* Join code
* Join link
* Waitlist
* Registration closing

### League

* Round robin
* Fixtures
* Matchdays
* Standings
* Points
* Goal difference
* Statistics

### Tournament/Cup

* Registration
* Capacity
* Automatic bracket
* Knockout rounds
* Final
* Champion

### Matches

* Match deadline
* Result submission
* Screenshot evidence
* Confirmation
* Dispute
* Forfeit
* Overdue status

### Player replacement

* Replace participant
* Preserve historical records
* Replace future matches
* Replacement reason
* Audit history

### Statistics

* Current competition
* All-time player statistics
* Clan statistics
* Records

### Community

* Announcements
* Activity feed
* Notifications

### History

* Previous seasons
* Previous competitions
* Champions
* Hall of Fame

---

# 4. Non-Goals for V1

The following should NOT be included initially:

* Multiple clans
* Public matchmaking
* Global player ranking
* Public social network
* Voice chat
* Video calls
* In-app eFootball gameplay
* Automatic reading of eFootball screenshots
* Payments
* Ads
* Public tournament marketplace
* Native Android/iOS codebases

The PWA should come first.

---

# 5. Platform

## 5.1 Progressive Web App

The application must work on:

* Android
* iPhone
* iPad
* Windows
* macOS
* Linux

The UI must be responsive.

Recommended breakpoints:

```text
Mobile:
320px – 767px

Tablet:
768px – 1023px

Desktop:
1024px+
```

---

# 6. Technology Stack

## Frontend

```text
React
TypeScript
Vite
Tailwind CSS
React Router
TanStack Query
Zustand
Supabase JS
PWA
```

## Backend infrastructure

```text
Supabase
├── PostgreSQL
├── Authentication
├── Storage
├── Realtime
└── Edge Functions when server-side logic is required
```

Supabase Auth supports password authentication and JWT-based sessions and integrates directly with Postgres authorization. ([Supabase][2])

## Hosting

Recommended:

```text
Frontend → Vercel / Netlify
Database → Supabase
Storage → Supabase Storage
Authentication → Supabase Auth
Realtime → Supabase Realtime
```

---

# 7. Why Supabase

The application has strongly relational data:

```text
Player
  ↓
Competition
  ↓
Round
  ↓
Match
  ↓
Result
  ↓
Statistics
```

PostgreSQL is therefore a natural fit.

Supabase also means we don't need to maintain a separate Node.js server for the first version.

The frontend can use the Supabase Data API securely when Row Level Security is correctly configured. Supabase explicitly recommends RLS for frontend-accessed tables and states that service-role/secret keys must never be exposed in frontend code. ([Supabase][3])

---

# 8. High-Level Architecture

```text
                     ┌─────────────────────┐
                     │      USER           │
                     │ Android / iOS / Web │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │      React PWA      │
                     │                     │
                     │ TypeScript          │
                     │ React               │
                     │ Tailwind            │
                     │ PWA                 │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │      SUPABASE       │
                     │                     │
                     │ Auth                │
                     │ PostgreSQL          │
                     │ Storage             │
                     │ Realtime            │
                     │ Edge Functions      │
                     └─────────────────────┘
```

---

# 9. Single-Clan Architecture

There is only one clan.

The database does NOT need a multi-tenant clan architecture.

Conceptually:

```text
                    CLAN
                     │
       ┌─────────────┼──────────────┐
       │             │              │
    MEMBERS      COMPETITIONS   ANNOUNCEMENTS
                     │
          ┌──────────┼──────────┐
          │          │          │
        LEAGUES     CUPS    TOURNAMENTS
          │          │          │
          └──────────┼──────────┘
                     │
                   MATCHES
```

---

# 10. User Roles

## 10.1 Owner

Full control.

Permissions:

* Manage admins
* Manage moderators
* Manage players
* Create competitions
* Edit competitions
* Delete competitions
* Manage results
* Resolve disputes
* Replace players
* Publish announcements
* Change clan settings
* View audit logs

There should normally be only one Owner.

---

## 10.2 Admin

Permissions:

* Manage players
* Create competitions
* Edit competitions
* Generate join codes
* Manage registration
* Manage fixtures
* Resolve disputes
* Replace players
* Publish announcements
* Modify results

Cannot transfer ownership unless explicitly allowed by Owner.

---

## 10.3 Moderator

Permissions:

* View competitions
* Validate results
* Handle disputes
* Modify match status
* Manage match deadlines where authorized

Cannot:

* Delete clan
* Manage Owner
* Change critical clan settings

---

## 10.4 Player

Permissions:

* View clan
* View members
* Join competitions
* View fixtures
* Submit results
* Upload evidence
* Confirm results
* Dispute results
* View statistics
* View announcements

---

# 11. Account System

There should be no open public registration.

A player becomes part of the application through an invitation.

## Flow

```text
Admin
 ↓
Create player invitation
 ↓
Invitation link/code
 ↓
Player opens invitation
 ↓
Create account
 ↓
Account activated
 ↓
Player becomes clan member
```

---

# 12. Player Account

Fields:

```text
id
username
display_name
email
avatar_url
country
efootball_name
efootball_id
bio
role
status
created_at
updated_at
last_login_at
```

---

# 13. Member Status

Possible states:

```text
INVITED
ACTIVE
INACTIVE
SUSPENDED
LEFT
REMOVED
```

Only ACTIVE members can normally participate in new competitions.

---

# 14. Clan Settings

Single database record.

Fields:

```text
id
name
tag
logo_url
banner_url
description
rules
country
timezone
created_at
updated_at
```

The timezone is important because all deadlines depend on it.

Recommended:

```text
Africa/Casablanca
```

The database should store timestamps in UTC and display them in the clan's configured timezone.

---

# 15. Application Navigation

## Mobile

Bottom navigation:

```text
┌───────────────────────────────────┐
│                                   │
│             CONTENT               │
│                                   │
├───────────────────────────────────┤
│ 🏠       🏆       ⚔️       👥    👤 │
│Home   Competitions Matches  Clan Profile
└───────────────────────────────────┘
```

---

# 16. Home Screen

The Home screen should prioritize actionable information.

## Sections

### Header

```text
Clan logo
VIK
Notifications 🔔
```

### Current competition

```text
🏆 VIK League S6

Your position:
#2

23 points
```

### Next match

```text
⚔️ NEXT MATCH

Pride
   VS
Shadow

Deadline:
Today • 23:59

[ VIEW MATCH ]
```

### Recent results

```text
Recent Matches

🟢 Pride 3–1 Shadow
🟢 Pride 2–0 Ryu
🔴 Pride 1–3 Ace
```

### Announcements

```text
📢 League S6 starts today
```

---

# 17. Competition Types

The system must support:

```text
LEAGUE
CUP
TOURNAMENT
SPECIAL_EVENT
```

---

# 18. Competition Lifecycle

Every competition follows:

```text
DRAFT
 ↓
REGISTRATION_OPEN
 ↓
REGISTRATION_CLOSED
 ↓
READY
 ↓
ACTIVE
 ↓
FINISHED
 ↓
ARCHIVED
```

---

# 19. Competition Creation

Admin selects:

```text
Competition name
Description
Type
Maximum players
Minimum players
Registration start
Registration deadline
Competition start
Competition end
Match deadline
Format
Rules
```

Example:

```text
VIK League S7

Type:
League

Capacity:
16 players

Registration:
01/10/2026
to
05/10/2026 23:59

Start:
06/10/2026

Match deadline:
48 hours

Format:
Round Robin
```

---

# 20. Registration System

Every competition has:

```text
registration_start
registration_deadline
max_players
min_players
```

---

# 21. Registration States

```text
NOT_OPEN
OPEN
FULL
CLOSED
```

---

# 22. Joining Through Code

Example:

```text
VIK7X92
```

Player enters:

```text
Join Competition

[ VIK7X92 ]

[ JOIN ]
```

Backend validates:

1. User authenticated
2. User is clan member
3. Competition exists
4. Registration is open
5. Capacity available
6. User isn't already registered
7. User isn't banned from competition

---

# 23. Joining Through Link

Example:

```text
/join/VIK7X92
```

Screen:

```text
🏆 VIK League S7

League
16 player capacity

Registration closes:
05 October • 23:59

Current:
12 / 16

[ JOIN COMPETITION ]
```

---

# 24. Competition Capacity

Capacity is enforced server-side.

Example:

```text
Maximum:
16

Current:
16
```

17th player:

```text
❌ Competition Full

16 / 16 players registered.

[ JOIN WAITLIST ]
```

The UI must never be trusted for capacity enforcement.

---

# 25. Waitlist

If enabled:

```text
WAITLIST

1. Ace
2. Ryu
3. Ghost
```

When a registered player leaves:

```text
Available slot
      ↓
First waitlisted player
      ↓
Notification
      ↓
Accept
      ↓
Registered
```

Waitlist acceptance should have an expiry, e.g. 12 or 24 hours.

---

# 26. Registration Closing

At:

```text
registration_deadline
```

the system automatically changes:

```text
REGISTRATION_OPEN
        ↓
REGISTRATION_CLOSED
```

No new players can join.

The join link/code becomes inactive.

---

# 27. Minimum Players

Example:

```text
Minimum:
8

Maximum:
16
```

At deadline:

```text
7 registered
```

The competition cannot automatically start.

Admin receives:

```text
⚠️ Not enough players

7 / 8 minimum players.

Options:
[ Extend Registration ]
[ Cancel Competition ]
```

---

# 28. Join Code Management

Admin can:

```text
Generate code
Copy code
Copy link
Disable joining
Regenerate code
```

If code is regenerated:

```text
OLD CODE
VIK7X92
❌ INVALID

NEW CODE
VIK8K41
✅ ACTIVE
```

---

# 29. League Format

V1 supports:

## Single Round Robin

Each participant plays every other participant once.

Example with 4 players:

```text
Round 1
A vs B
C vs D

Round 2
A vs C
B vs D

Round 3
A vs D
B vs C
```

---

# 30. League Points

Default:

```text
Win  = 3
Draw = 1
Loss = 0
```

Admin can configure these values before the competition starts.

Once competition starts, changing scoring rules should require Owner/Admin confirmation and generate an audit log.

---

# 31. League Standings

Fields:

```text
Position
Player
Played
Wins
Draws
Losses
Goals For
Goals Against
Goal Difference
Points
```

Example:

```text
# PLAYER     P  W  D  L  GF GA GD PTS

1 Pride      10 8 1 1 25 9 +16 25
2 Shadow     10 7 2 1 22 11 +11 23
3 Ryu        10 6 1 3 20 14 +6 19
```

---

# 32. Tie-Break Rules

Default:

```text
1. Points
2. Goal Difference
3. Goals Scored
4. Head-to-Head
5. Wins
6. Admin resolution
```

These should be configurable.

---

# 33. Matchdays

The system should group fixtures into rounds.

Example:

```text
MATCHDAY 1
01–02 October

MATCHDAY 2
03–04 October

MATCHDAY 3
05–06 October
```

Each match can also have its own exact deadline.

---

# 34. Match Deadline

Every match must have:

```text
scheduled_at
deadline
```

Example:

```text
Pride vs Shadow

Deadline:
02 October 2026
23:59
```

---

# 35. Deadline Display

Mobile:

```text
⏱ 05h 32m remaining
```

Warning:

```text
⚠️ Deadline in 3 hours
```

Expired:

```text
🔴 Deadline passed
```

The countdown is only UI.

The backend/database timestamp is authoritative.

---

# 36. Match Status

```text
SCHEDULED
PLAYED
RESULT_SUBMITTED
CONFIRMED
DISPUTED
OVERDUE
FORFEIT
CANCELLED
```

---

# 37. Match Result Submission

Player sees:

```text
SUBMIT RESULT

Your score:
[ 3 ]

Opponent:
Shadow

Opponent score:
[ 1 ]

Screenshot:
[ + UPLOAD ]

Comment:
[ optional ]

[ SUBMIT RESULT ]
```

---

# 38. Screenshot Evidence

Recommended restrictions:

```text
Allowed:
JPG
JPEG
PNG
WEBP

Maximum:
5–10 MB per image
```

Only one or a small number of screenshots should be required.

The application should compress images before upload when possible to reduce storage usage.

Supabase Storage supports access policies through RLS, so match evidence can be restricted to authenticated clan users rather than exposing files publicly. ([Supabase][4])

---

# 39. Result Confirmation

After submission:

```text
RESULT SUBMITTED

Pride 3–1 Shadow

Waiting for Shadow.
```

Opponent:

```text
Pride submitted:

3–1

[ CONFIRM RESULT ]
[ DISPUTE ]
```

---

# 40. Confirmation

When opponent confirms:

```text
Match
   ↓
CONFIRMED
   ↓
Update standings
   ↓
Update statistics
   ↓
Create activity
   ↓
Send notifications
```

---

# 41. Dispute

Player selects:

```text
DISPUTE RESULT
```

Reasons:

```text
Incorrect score
Match did not happen
Wrong opponent
Invalid screenshot
Other
```

Description:

```text
[ Explain the problem ]
```

Evidence:

```text
[ Upload ]
```

---

# 42. Dispute Status

```text
OPEN
UNDER_REVIEW
RESOLVED
REJECTED
```

---

# 43. Admin Dispute Resolution

Admin sees:

```text
DISPUTE

Pride vs Shadow

Reported:
3–1

Claim:
Shadow says result was 2–2.

Evidence:
[ screenshot ]

Actions:

[ Accept 3–1 ]
[ Change Result ]
[ Cancel Match ]
[ Award Forfeit ]
[ Reject Dispute ]
```

Every decision goes into the audit log.

---

# 44. Match Deadline Expiry

When deadline passes:

```text
CONFIRMED
```

is impossible unless already submitted.

If no result:

```text
OVERDUE
```

Admin decides:

```text
Extend deadline
Award forfeit
Cancel match
Set result
```

---

# 45. Forfeit

Example:

```text
Pride vs Shadow

Shadow did not play.

Admin:
Award forfeit to Pride.

Result:
Pride 3–0 Shadow
```

The default forfeit score should be configurable.

---

# 46. Player Replacement

This is a first-class feature.

Admin:

```text
Competition
 ↓
Participants
 ↓
Shadow
 ↓
Replace Player
```

Select:

```text
Replacement:
Ace
```

Reason:

```text
Player inactive
```

---

# 47. Replacement Rules

## Before competition starts

Simple replacement:

```text
Shadow
   ↓
removed

Ace
   ↓
registered
```

Ace receives Shadow's competition slot.

---

# 48. Replacement During Competition

Existing results should not be silently deleted.

Example:

```text
Shadow

Played:
5

W:
3
D:
1
L:
1

Status:
REPLACED
```

Ace:

```text
Ace

Joined:
02 October

Matches from:
02 October onward
```

Existing Shadow matches remain historical records.

Future fixtures are transferred to Ace.

---

# 49. Replacement Modes

Admin chooses:

```text
Future Matches Only
```

Recommended default.

Optional advanced modes:

```text
Reset Competition Record
Transfer Competition Record
```

Changing historical results should require confirmation because it affects standings.

---

# 50. Replacement History

Database should retain:

```text
original_player
replacement_player
competition
date
reason
performed_by
```

Example:

```text
Shadow → Ace

02 Oct 2026

Reason:
Player inactive

Performed by:
Admin
```

---

# 51. Clan Member vs Competition Participant

These are different concepts.

A player can:

```text
CLAN MEMBER
Active

COMPETITION
Replaced
```

The player is still part of the clan.

Removing someone from a competition does NOT automatically remove them from the clan.

---

# 52. Tournament/Cup

Tournament and Cup use a knockout structure.

Example:

```text
QUARTER FINAL

Pride ───────┐
             ├── Pride ──────┐
Shadow ──────┘               │
                             ├── CHAMPION
Ryu ─────────┐               │
             ├── Ryu ────────┘
Ace ─────────┘
```

---

# 53. Tournament Registration

Same system as league:

```text
Name
Capacity
Minimum players
Registration start
Registration deadline
Competition start
Join code
Join link
Waitlist
```

---

# 54. Tournament Capacity

Example:

```text
VIK CUP #5

Capacity:
16

Registered:
16 / 16
```

17th player:

```text
Competition full.
Join waitlist?
```

---

# 55. Bracket Size

The system should support:

```text
4 players
8 players
16 players
32 players
```

For V1, recommended:

```text
4
8
16
```

If a non-power-of-two capacity is allowed later, the bracket engine can generate byes.

---

# 56. Tournament Rounds

```text
ROUND OF 16
     ↓
QUARTER FINAL
     ↓
SEMI FINAL
     ↓
FINAL
     ↓
CHAMPION
```

---

# 57. Tournament Match Deadlines

Each bracket match gets its own deadline.

Example:

```text
Quarter Final

Pride vs Shadow

Deadline:
08 October — 23:59
```

The next round should not become active until the previous round is sufficiently resolved.

---

# 58. Competition End Deadline

A competition can also have a final deadline:

```text
Competition starts:
06 Oct

Competition ends:
20 Oct
```

This is separate from individual match deadlines.

If the final competition deadline arrives, admin receives an alert about unresolved matches.

---

# 59. Player Statistics

Every player has two statistical levels.

## Competition statistics

```text
VIK League S7

Matches 10
Wins 8
Draws 1
Losses 1

Goals 25
Conceded 9
GD +16
Points 25
```

## Career statistics

```text
VIK CAREER

Matches 142
Wins 98
Draws 21
Losses 23

Goals 312
Conceded 178

League titles 3
Cup titles 2
```

---

# 60. Player Profile

```text
┌───────────────────────────┐
│          PRIDE            │
│        ⚔️ VIK             │
│                           │
│ 🏆 3 League Titles        │
│ 🏆 2 Cups                 │
│                           │
│ Matches       142         │
│ Wins           98         │
│ Draws          21         │
│ Losses         23         │
│ Win Rate       69%        │
│                           │
│ Goals          312        │
│ Conceded       178        │
│ Goal Diff     +134        │
│                           │
│ Form                          │
│ 🟢 🟢 🟢 🔴 🟢            │
└───────────────────────────┘
```

---

# 61. Head-to-Head

Player profile should contain:

```text
PRIDE vs SHADOW

Matches: 12

Pride wins: 7
Draws: 2
Shadow wins: 3

Pride goals: 24
Shadow goals: 16
```

---

# 62. Clan Statistics

```text
TOTAL MEMBERS
18

TOTAL MATCHES
1,284

TOTAL GOALS
3,921

LEAGUE SEASONS
6

CUPS
12
```

---

# 63. Clan Records

Examples:

```text
Most League Titles
Most Cup Titles
Most Wins
Most Goals
Most Matches
Longest Winning Streak
Longest Unbeaten Streak
Biggest Victory
Highest Scoring Match
Most Goals in One Competition
```

---

# 64. Hall of Fame

```text
VIK HALL OF FAME

LEAGUE CHAMPIONS

S1 — Pride
S2 — Shadow
S3 — Pride
S4 — Ryu
S5 — Pride
S6 — ???

CUP CHAMPIONS

Cup 1 — Pride
Cup 2 — Ryu
Cup 3 — Shadow
```

---

# 65. Announcements

Admin can create:

```text
Title
Content
Priority
Published at
Expiration date
```

Priority:

```text
NORMAL
IMPORTANT
URGENT
```

Example:

```text
📢 IMPORTANT

VIK League S7 begins tomorrow.

All Matchday 1 games must be completed
before 23:59 on October 7.
```

---

# 66. Activity Feed

Events can be generated automatically.

Examples:

```text
🏆 Pride won VIK League S6

⚔️ Pride defeated Shadow 3–1

🔥 Shadow reached a 7-match winning streak

🎮 Ace joined the clan

🏆 VIK Cup #5 has started

👑 Pride became champion
```

---

# 67. Notification System

Notification types:

```text
MATCH_ASSIGNED
MATCH_DEADLINE_WARNING
MATCH_OVERDUE
RESULT_SUBMITTED
RESULT_CONFIRMED
RESULT_DISPUTED
DISPUTE_RESOLVED
COMPETITION_INVITATION
REGISTRATION_OPEN
REGISTRATION_CLOSING
COMPETITION_STARTED
COMPETITION_FINISHED
PLAYER_REPLACED
ANNOUNCEMENT
WAITLIST_AVAILABLE
```

---

# 68. Notification Channels

V1:

```text
In-app notifications
```

Optional:

```text
Browser push
Email
```

Push notifications should be implemented only after the basic notification system is stable.

---

# 69. Notification Center

```text
🔔 Notifications

Today

⚔️ Your match with Shadow is due today.

2h ago

✅ Shadow confirmed your result.

Yesterday

🏆 VIK League S7 registration opened.
```

---

# 70. Admin Dashboard

```text
ADMIN

Members
18

Active competitions
2

Pending matches
7

Overdue matches
2

Open disputes
1

Upcoming deadlines
5
```

---

# 71. Admin Quick Actions

```text
[ CREATE COMPETITION ]

[ ADD PLAYER ]

[ CREATE ANNOUNCEMENT ]

[ REVIEW DISPUTES ]

[ MANAGE MATCHES ]
```

---

# 72. Admin Competition Management

```text
Competition
 ├── Overview
 ├── Participants
 ├── Registration
 ├── Fixtures
 ├── Standings
 ├── Results
 ├── Disputes
 ├── Statistics
 └── Settings
```

---

# 73. Audit Log

Every important administrative action must be recorded.

Examples:

```text
ADMIN CREATED COMPETITION
ADMIN CHANGED MATCH RESULT
ADMIN REPLACED PLAYER
ADMIN EXTENDED DEADLINE
ADMIN RESOLVED DISPUTE
ADMIN REMOVED PLAYER
ADMIN CHANGED COMPETITION SETTINGS
```

Fields:

```text
id
user_id
action
entity_type
entity_id
old_value
new_value
reason
created_at
```

---

# 74. Database Design

## profiles

```text
id UUID PRIMARY KEY
username TEXT UNIQUE
display_name TEXT
email TEXT
avatar_url TEXT
country TEXT
efootball_name TEXT
efootball_id TEXT
bio TEXT
role TEXT
status TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
last_login_at TIMESTAMPTZ
```

`id` references Supabase Auth user ID.

---

# 75. clan_settings

```text
id UUID PRIMARY KEY
name TEXT
tag TEXT
logo_url TEXT
banner_url TEXT
description TEXT
rules TEXT
country TEXT
timezone TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Only one row should exist.

---

# 76. competitions

```text
id UUID PRIMARY KEY

name TEXT
description TEXT

type TEXT
status TEXT

min_players INTEGER
max_players INTEGER

registration_start TIMESTAMPTZ
registration_deadline TIMESTAMPTZ

start_date TIMESTAMPTZ
end_date TIMESTAMPTZ

match_deadline_hours INTEGER

join_code TEXT UNIQUE
join_enabled BOOLEAN

format TEXT

points_win INTEGER
points_draw INTEGER
points_loss INTEGER

created_by UUID
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 77. competition_participants

```text
id UUID PRIMARY KEY

competition_id UUID
player_id UUID

status TEXT

joined_at TIMESTAMPTZ
left_at TIMESTAMPTZ

replacement_for UUID
replacement_date TIMESTAMPTZ
replacement_reason TEXT

created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 78. competition_waitlist

```text
id UUID PRIMARY KEY

competition_id UUID
player_id UUID

position INTEGER

joined_at TIMESTAMPTZ
expires_at TIMESTAMPTZ

status TEXT
```

---

# 79. rounds

```text
id UUID PRIMARY KEY

competition_id UUID

round_number INTEGER
name TEXT

start_date TIMESTAMPTZ
deadline TIMESTAMPTZ

status TEXT

created_at TIMESTAMPTZ
```

---

# 80. matches

```text
id UUID PRIMARY KEY

competition_id UUID
round_id UUID

player_a_id UUID
player_b_id UUID

score_a INTEGER
score_b INTEGER

status TEXT

scheduled_at TIMESTAMPTZ
deadline TIMESTAMPTZ

submitted_by UUID
submitted_at TIMESTAMPTZ

confirmed_by UUID
confirmed_at TIMESTAMPTZ

winner_id UUID

forfeit_player_id UUID

created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 81. Match Evidence

```text
id UUID PRIMARY KEY

match_id UUID

file_path TEXT
file_type TEXT
file_size INTEGER

uploaded_by UUID

created_at TIMESTAMPTZ
```

---

# 82. Disputes

```text
id UUID PRIMARY KEY

match_id UUID

created_by UUID

reason TEXT
description TEXT

status TEXT

resolved_by UUID
resolution TEXT

created_at TIMESTAMPTZ
resolved_at TIMESTAMPTZ
```

---

# 83. Announcements

```text
id UUID PRIMARY KEY

title TEXT
content TEXT

priority TEXT

created_by UUID

published_at TIMESTAMPTZ
expires_at TIMESTAMPTZ

created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 84. Notifications

```text
id UUID PRIMARY KEY

user_id UUID

type TEXT

title TEXT
message TEXT

entity_type TEXT
entity_id UUID

read_at TIMESTAMPTZ

created_at TIMESTAMPTZ
```

---

# 85. Achievements

```text
id UUID PRIMARY KEY

player_id UUID
competition_id UUID

type TEXT
name TEXT
description TEXT

awarded_at TIMESTAMPTZ
```

---

# 86. Audit Logs

```text
id UUID PRIMARY KEY

actor_id UUID

action TEXT

entity_type TEXT
entity_id UUID

old_data JSONB
new_data JSONB

reason TEXT

created_at TIMESTAMPTZ
```

---

# 87. Important Database Constraints

The database must prevent invalid states.

Examples:

### Unique username

```text
username UNIQUE
```

### Unique competition code

```text
join_code UNIQUE
```

### Prevent duplicate registration

```text
UNIQUE(competition_id, player_id)
```

### Prevent a player against themselves

A match must satisfy:

```text
player_a_id != player_b_id
```

### Scores cannot be negative

```text
score_a >= 0
score_b >= 0
```

### Capacity

Capacity must be validated transactionally/server-side.

---

# 88. Security

Every exposed database table must use Row Level Security.

Supabase specifically recommends enabling RLS on exposed tables and configuring grants and policies for each operation. ([Supabase][3])

Basic security model:

```text
Anonymous
   ↓
Can access almost nothing

Authenticated clan member
   ↓
Can read clan data

Player
   ↓
Can modify own allowed actions

Moderator
   ↓
Can moderate

Admin
   ↓
Can manage

Owner
   ↓
Full control
```

---

# 89. Frontend Security

Never put:

```text
SUPABASE_SERVICE_ROLE_KEY
```

in the frontend.

Frontend uses only the public/publishable key with RLS.

Supabase explicitly states that service-role/secret keys bypass RLS and must remain server-side. ([Supabase][5])

---

# 90. Realtime

Realtime can be used for:

```text
Standings updates
New notifications
Match result submission
Result confirmation
Activity feed
Admin changes
```

Example:

```text
Player A confirms result
        ↓
Database update
        ↓
Realtime event
        ↓
Other connected users
        ↓
UI updates automatically
```

Supabase Realtime supports private channels and authorization through RLS. ([Supabase][6])

The current Free plan supports up to 200 peak concurrent Realtime connections and 2 million Realtime messages per month. ([Supabase][7])

For one clan, that is substantially more than the application is likely to require initially.

---

# 91. Storage Structure

Recommended Supabase Storage buckets:

```text
avatars
clan-assets
match-evidence
```

Paths:

```text
avatars/{user_id}/avatar.webp

clan-assets/logo.webp
clan-assets/banner.webp

match-evidence/{competition_id}/{match_id}/screenshot.webp
```

---

# 92. Storage Rules

Only authenticated clan members should access private competition evidence.

Do not make screenshots publicly accessible by default.

Supabase Storage supports access policies through RLS on storage objects. ([Supabase][4])

---

# 93. Image Optimization

Before upload:

```text
Original screenshot
        ↓
Resize if necessary
        ↓
Compress
        ↓
WEBP/JPEG
        ↓
Upload
```

Recommended maximum:

```text
Width:
1920px

Target size:
< 1–2 MB
```

This helps preserve the free storage quota.

Supabase's current Free plan provides 1 GB of Storage, so screenshots should be treated as a finite resource. ([Supabase][1])

---

# 94. Competition Engine

Competition generation should be implemented as separate logic.

Example:

```text
src/
└── competition/
    ├── leagueEngine.ts
    ├── knockoutEngine.ts
    ├── standingsEngine.ts
    ├── deadlineEngine.ts
    └── replacementEngine.ts
```

This keeps competition logic separate from UI.

---

# 95. League Generation Algorithm

Input:

```text
players[]
```

Output:

```text
rounds[]
matches[]
```

Requirements:

* Every player plays each other once
* No player plays themselves
* No duplicate pair
* Every player gets appropriate number of matches
* Rounds are balanced
* Match IDs are unique

---

# 96. Knockout Generation

Input:

```text
participants
```

Output:

```text
bracket
```

Example:

```text
16 players

Round of 16
     ↓
Quarter Finals
     ↓
Semi Finals
     ↓
Final
```

---

# 97. Standings Engine

Standings must NOT be manually entered.

Calculate from confirmed matches.

Pseudo-flow:

```text
Get confirmed matches
        ↓
For each match
        ↓
Calculate result
        ↓
Add W/D/L
        ↓
Add goals
        ↓
Calculate GD
        ↓
Calculate points
        ↓
Apply tie breakers
        ↓
Sort
```

---

# 98. Important Rule

Only **CONFIRMED** results affect standings.

These must NOT affect standings:

```text
SCHEDULED
RESULT_SUBMITTED
DISPUTED
CANCELLED
```

Unless an administrator explicitly resolves them into a valid result.

---

# 99. Deadline Engine

The application should periodically check:

```text
current_time > deadline
```

For matches:

```text
SCHEDULED
      ↓
deadline passed
      ↓
OVERDUE
```

For registration:

```text
OPEN
 ↓
deadline passed
 ↓
CLOSED
```

For competitions:

```text
ACTIVE
 ↓
end date passed
 ↓
ADMIN REVIEW / FINISH
```

Use server-side scheduled logic where possible rather than relying on a user's browser being open.

---

# 100. Edge Functions / Server-Side Logic

Although the first version can use Supabase directly, server-side functions should be used for sensitive operations such as:

* Generating competitions
* Generating fixtures
* Joining with capacity validation
* Replacing players
* Resolving results
* Processing deadlines
* Sending notifications
* Awarding achievements

This prevents users from manipulating important competition logic from browser code.

---

# 101. Join Competition Server Flow

```text
User
 ↓
Join code
 ↓
Server validation
 ↓
Is authenticated?
 ↓
Is clan member?
 ↓
Competition exists?
 ↓
Registration open?
 ↓
Not already registered?
 ↓
Capacity available?
 ↓
INSERT participant
 ↓
Return success
```

---

# 102. Match Result Server Flow

```text
Player submits result
        ↓
Validate match
        ↓
Validate player
        ↓
Validate deadline
        ↓
Validate score
        ↓
Upload evidence
        ↓
Save result
        ↓
Notify opponent
        ↓
Opponent confirms
        ↓
Match CONFIRMED
        ↓
Recalculate standings
        ↓
Update statistics
```

---

# 103. Replacement Server Flow

```text
Admin
 ↓
Select competition
 ↓
Select participant
 ↓
Select replacement
 ↓
Validate replacement
 ↓
Check replacement is clan member
 ↓
Check not already participating
 ↓
Create replacement record
 ↓
Transfer future fixtures
 ↓
Preserve history
 ↓
Audit action
 ↓
Notify affected players
```

---

# 104. API / Data Service Organization

Even though Supabase provides the backend, don't scatter database calls throughout React components.

Use:

```text
src/services/

authService.ts
playerService.ts
competitionService.ts
matchService.ts
standingsService.ts
notificationService.ts
announcementService.ts
statisticsService.ts
storageService.ts
```

Example:

```text
competitionService.createCompetition()
competitionService.joinCompetition()
competitionService.leaveCompetition()
competitionService.replacePlayer()
```

---

# 105. Frontend Structure

```text
src/
│
├── app/
│   ├── router.tsx
│   └── providers.tsx
│
├── components/
│   ├── ui/
│   ├── competition/
│   ├── match/
│   ├── player/
│   ├── clan/
│   └── admin/
│
├── pages/
│   ├── Home/
│   ├── Login/
│   ├── Competitions/
│   ├── Competition/
│   ├── Match/
│   ├── Player/
│   ├── Clan/
│   ├── Notifications/
│   ├── Profile/
│   └── Admin/
│
├── services/
├── hooks/
├── stores/
├── types/
├── utils/
├── lib/
└── assets/
```

---

# 106. Mobile UX

Because eFootball Mobile players will mostly use phones:

Prioritize:

* Large buttons
* Easy navigation
* Minimal typing
* Clear deadlines
* Large score inputs
* Fast screenshot upload
* Bottom navigation
* Touch-friendly controls

Avoid:

* Huge tables
* Tiny buttons
* Desktop-style forms
* Too many fields
* Long paragraphs

---

# 107. Match Screen UX

The match screen should be optimized for one-handed phone use.

```text
PRIDE

        3
        ─
        1

SHADOW

🟢 CONFIRMED

────────────

Deadline:
Completed

Evidence:
[ View Screenshot ]

────────────

Head-to-Head
[ View History ]
```

For pending matches:

```text
Pride
VS
Shadow

⏱ 05h 32m

[ SUBMIT RESULT ]
```

---

# 108. Competition UX

Competition page tabs:

```text
Overview
Standings
Matches
Players
Stats
```

For tournament:

```text
Overview
Bracket
Matches
Players
Stats
```

---

# 109. Loading States

Every asynchronous operation needs a loading state.

Examples:

```text
Loading standings...
Loading matches...
Submitting result...
Uploading screenshot...
Joining competition...
Generating fixtures...
```

Do not show blank screens.

---

# 110. Error Handling

Errors must be human-readable.

Bad:

```text
Error 23505
```

Good:

```text
You are already registered for this competition.
```

Another:

```text
This competition is already full.
```

Another:

```text
The registration deadline has passed.
```

---

# 111. Empty States

Example:

```text
No upcoming matches.

You're all caught up! 🎮
```

No competitions:

```text
No active competitions.

Check back when the next competition opens.
```

No notifications:

```text
You're all caught up.
```

---

# 112. Confirmation Dialogs

Dangerous actions require confirmation.

Examples:

```text
Delete competition?
```

```text
Remove player from clan?
```

```text
Replace Shadow with Ace?
```

```text
Change confirmed result?
```

Never perform destructive actions with one accidental tap.

---

# 113. Competition Locking

Once a competition starts, critical settings should become locked.

For example:

Cannot casually change:

```text
Format
Participants
Points system
Start date
```

Admin must explicitly:

```text
Edit locked competition
```

with warning:

```text
This change may affect existing matches and standings.
```

---

# 114. Competition Archive

When finished:

```text
VIK League S6
FINISHED

Champion:
Pride

Runner-up:
Shadow

Third:
Ryu

Matches:
66

Goals:
182
```

The competition becomes read-only for normal users.

---

# 115. Historical Integrity

Never delete historical competition data just because a player leaves the clan.

Example:

```text
VIK League S4

Champion:
Pride

Participant:
Shadow

Status:
Former Clan Member
```

Historical records remain intact.

---

# 116. Season System

Optional but highly recommended.

A season groups competitions.

Example:

```text
SEASON 2026

League S1
Cup #1
Cup #2
Special Tournament

League S2
Cup #3
```

This gives the clan long-term history.

---

# 117. Season Structure

```text
Season
 ├── League
 ├── Cups
 ├── Tournaments
 └── Special Events
```

The application can later show:

```text
SEASON 2026

🏆 League Champion
Pride

🏆 Cup Champion
Shadow

⭐ Season MVP
Ryu
```

---

# 118. MVP

This can be manual in V1.

Admin selects:

```text
Season MVP:
Pride
```

The application records it as an achievement.

Later it can be calculated automatically.

---

# 119. Clan Rules

Clan settings should allow administrators to publish rules.

Example:

```text
MATCH RULES

1. Every match has a deadline.
2. Screenshot evidence is required.
3. Results must be confirmed by opponent.
4. Disputes must be submitted before the deadline.
5. Admin decisions are recorded.
```

---

# 120. Accessibility

Requirements:

* High contrast
* Keyboard support on desktop
* Semantic HTML
* Visible focus states
* Accessible labels
* Buttons with sufficient touch area
* Do not rely only on color to indicate status

Example:

Instead of:

```text
🟢
```

also show:

```text
CONFIRMED
```

---

# 121. PWA Requirements

The PWA must include:

```text
manifest.json
service worker
icons
theme color
app name
short name
start URL
display: standalone
```

Users should be able to install it to their phone home screen.

---

# 122. Offline Behavior

Full offline functionality is not required.

But the app should cache:

* App shell
* Static assets
* Basic previously viewed information

If offline:

```text
You are offline.

Some information may be outdated.
```

Do not allow important competition mutations while offline.

---

# 123. Responsive Desktop

Desktop can use a sidebar:

```text
┌──────────────┬──────────────────────────┐
│ VIK          │                          │
│              │        CONTENT           │
│ Home         │                          │
│ Competitions │                          │
│ Matches      │                          │
│ Clan         │                          │
│ Statistics   │                          │
│ Profile      │                          │
│              │                          │
│ Admin        │                          │
└──────────────┴──────────────────────────┘
```

---

# 124. Recommended URL Structure

```text
/login

/home

/competitions
/competitions/:id
/competitions/:id/standings
/competitions/:id/matches
/competitions/:id/bracket
/competitions/:id/stats

/matches/:id

/players
/players/:id

/clan
/clan/members
/clan/history
/clan/hall-of-fame

/notifications

/profile
/settings

/admin
/admin/competitions
/admin/members
/admin/disputes
/admin/announcements
/admin/audit
```

Join:

```text
/join/:code
```

---

# 125. Testing Requirements

## Unit tests

Test:

* League generation
* Standings
* Points
* Tie breakers
* Deadline calculations
* Replacement logic
* Capacity logic
* Join code validation

## Integration tests

Test:

```text
Create competition
 ↓
Register players
 ↓
Generate matches
 ↓
Submit result
 ↓
Confirm result
 ↓
Update standings
```

## Security tests

Test:

* Player cannot edit another player's result
* Player cannot create admin actions
* Non-member cannot join
* Full competition cannot accept player
* Closed registration rejects joins
* Expired competition code rejects joins
* Service keys never reach frontend

Supabase recommends testing RLS policies for allowed and denied operations rather than assuming policies are correct. ([Supabase][3])

---

# 126. Critical Business Rules

These rules are mandatory.

### Rule 1

Only clan members can access the private application.

### Rule 2

Only active clan members can join new competitions.

### Rule 3

A player cannot register twice for the same competition.

### Rule 4

Competition capacity cannot be exceeded.

### Rule 5

Registration cannot occur after the registration deadline.

### Rule 6

Join codes cannot work after registration closes.

### Rule 7

Only confirmed results affect standings.

### Rule 8

Players cannot modify confirmed results.

### Rule 9

Only authorized admins/moderators can resolve disputes.

### Rule 10

Every administrative change is logged.

### Rule 11

Existing historical matches must not disappear when a player is replaced.

### Rule 12

A replacement only affects future matches by default.

### Rule 13

A player cannot replace another player if already participating in that competition.

### Rule 14

Match deadlines are enforced using server/database time.

### Rule 15

Client-side countdowns are informational only.

---

# 127. Recommended V1 Development Order

## Phase 0 — Project setup

```text
Create Git repository
Create React/Vite project
Create Supabase project
Configure environment variables
Configure PWA
Configure TypeScript
Configure Tailwind
```

---

## Phase 1 — Database

Create:

```text
profiles
clan_settings
competitions
competition_participants
competition_waitlist
rounds
matches
match_evidence
disputes
announcements
notifications
achievements
audit_logs
```

Create:

* indexes
* foreign keys
* constraints
* RLS
* policies

---

## Phase 2 — Authentication

Build:

```text
Login
Logout
Invitation
Password reset
Session management
```

---

## Phase 3 — Clan

Build:

```text
Clan dashboard
Members
Member profiles
Roles
Clan settings
```

---

## Phase 4 — Competition engine

Build:

```text
Create competition
Registration
Join code
Join link
Capacity
Waitlist
Registration deadline
```

---

## Phase 5 — League engine

Build:

```text
Round robin generator
Rounds
Fixtures
Standings
Tie breakers
```

---

## Phase 6 — Match engine

Build:

```text
Match screen
Deadline
Result submission
Screenshot
Confirmation
Dispute
Forfeit
Overdue
```

---

## Phase 7 — Tournament engine

Build:

```text
Bracket
Rounds
Quarter finals
Semi finals
Final
Winner
```

---

## Phase 8 — Player replacement

Build:

```text
Replace participant
Transfer future matches
Preserve history
Replacement history
Notifications
```

---

## Phase 9 — Statistics

Build:

```text
Player stats
Competition stats
Career stats
Head-to-head
Clan records
Hall of Fame
```

---

## Phase 10 — Community

Build:

```text
Announcements
Activity feed
Notifications
```

---

## Phase 11 — Realtime

Add:

```text
Live standings
Live notifications
Live result updates
```

---

## Phase 12 — PWA

Test:

```text
Android
iPhone
Desktop
Install
Offline shell
Push notifications
```

---

# 128. V1 Acceptance Test

The application is considered functional when the following complete scenario works:

```text
ADMIN
 ↓
Creates "VIK League S1"
 ↓
Capacity = 8
 ↓
Registration deadline = Friday
 ↓
Match deadline = 48 hours
 ↓
Generates join code
 ↓
Shares link
```

Players:

```text
Player 1 joins
Player 2 joins
Player 3 joins
...
Player 8 joins
```

Player 9:

```text
→ Competition full
→ Added to waitlist
```

Registration deadline arrives:

```text
→ Registration closes
→ Code disabled
```

Admin starts competition:

```text
→ Fixtures generated
```

Player 1:

```text
→ Sees next match
→ Plays match
→ Submits 3–1
→ Uploads screenshot
```

Player 2:

```text
→ Receives notification
→ Confirms
```

System:

```text
→ Match CONFIRMED
→ Standings updated
→ Player statistics updated
→ Activity created
→ Notification sent
```

Another match:

```text
→ Deadline passes
→ Match becomes OVERDUE
→ Admin resolves it
→ Result becomes official
```

Another player:

```text
→ Leaves competition
```

Admin:

```text
→ Selects replacement
→ Chooses another clan member
→ Future matches transferred
→ Historical matches preserved
```

Competition finishes:

```text
→ Champion calculated
→ Statistics finalized
→ Hall of Fame updated
→ Competition archived
```

If this complete scenario works, the core application works.

---

# 129. Final Recommended Technology

```text
                 eFOOTBALL CLAN APP

                         │
                         ▼

              ┌─────────────────────┐
              │      React PWA      │
              │                     │
              │ TypeScript          │
              │ Vite                │
              │ Tailwind            │
              │ React Router        │
              │ TanStack Query      │
              └──────────┬──────────┘
                         │
                         ▼

              ┌─────────────────────┐
              │      SUPABASE       │
              │                     │
              │ PostgreSQL          │
              │ Auth                │
              │ Storage             │
              │ Realtime            │
              │ Edge Functions      │
              └─────────────────────┘
```

This architecture avoids unnecessary infrastructure while retaining room for more advanced server-side logic through Edge Functions. Supabase's architecture integrates Auth, Postgres, Realtime, Storage and API services around the same project. ([Supabase][8])

---

# 130. Product Identity

The application should feel like:

**The official digital headquarters of the clan.**

Not:

> "A generic tournament website."

The main experience should be:

```text
HOME
 ↓
YOUR NEXT MATCH
 ↓
DEADLINE
 ↓
PLAY
 ↓
RESULT
 ↓
CONFIRM
 ↓
RANKING
 ↓
STATISTICS
 ↓
HISTORY
```

The competition system is the heart of the application.

---

# 131. Final Feature Map

```text
VIK CLAN APP
│
├── 🔐 Authentication
│   ├── Login
│   ├── Invitations
│   ├── Password reset
│   └── Sessions
│
├── 🏠 Home
│   ├── Next match
│   ├── Deadlines
│   ├── Current ranking
│   ├── Announcements
│   └── Activity
│
├── 👥 Clan
│   ├── Members
│   ├── Roles
│   ├── Player profiles
│   ├── Clan rules
│   └── Hall of Fame
│
├── 🏆 Competitions
│   ├── Leagues
│   ├── Cups
│   ├── Tournaments
│   └── Special events
│
├── 📝 Registration
│   ├── Deadline
│   ├── Capacity
│   ├── Join code
│   ├── Join link
│   └── Waitlist
│
├── ⚔️ Matches
│   ├── Fixtures
│   ├── Deadlines
│   ├── Results
│   ├── Evidence
│   ├── Confirmation
│   ├── Disputes
│   ├── Forfeits
│   └── Overdue matches
│
├── 🔄 Player Replacement
│   ├── Replace player
│   ├── Future matches
│   ├── Historical preservation
│   └── Replacement history
│
├── 📊 Statistics
│   ├── Player
│   ├── Competition
│   ├── Career
│   ├── Head-to-head
│   └── Clan records
│
├── 📢 Community
│   ├── Announcements
│   ├── Activity
│   └── Notifications
│
├── 🏛️ History
│   ├── Seasons
│   ├── Champions
│   ├── Competitions
│   └── Hall of Fame
│
└── 🛡️ Administration
    ├── Members
    ├── Competitions
    ├── Matches
    ├── Disputes
    ├── Announcements
    ├── Settings
    └── Audit logs
```

# 132. Definition of Done

The application is V1-ready when:

* Authentication works.
* Only invited clan members can enter.
* Roles are enforced.
* Clan information is manageable.
* Admin can create a league.
* Admin can create a cup/tournament.
* Registration has start/end dates.
* Registration capacity is enforced.
* Players can join through code.
* Players can join through a link.
* Waitlist works.
* Registration closes automatically.
* Fixtures generate correctly.
* Matches have deadlines.
* Deadline status is server-controlled.
* Players can submit results.
* Screenshots can be uploaded.
* Opponents can confirm results.
* Players can dispute results.
* Admin can resolve disputes.
* Overdue matches are detected.
* Forfeits work.
* Player replacement works.
* Historical matches remain intact.
* Future matches are transferred correctly.
* Standings calculate automatically.
* Statistics calculate automatically.
* Tournament brackets work.
* Champions are recorded.
* Announcements work.
* Notifications work.
* Activity feed works.
* Hall of Fame works.
* Audit logs work.
* RLS protects the database.
* Storage access is protected.
* PWA installs correctly on Android and iOS.
* The application works on desktop.
* The application survives refresh/session restoration.
* Critical business rules cannot be bypassed from the browser.

**This is the baseline specification I would use before writing the first line of application code.**

A few implementation notes are especially important: **do not put competition rules only in React**, because users can manipulate client-side code; capacity, deadlines, result confirmation, replacements, and permissions need database/server-side enforcement. Supabase's RLS is designed for this kind of row-level authorization. ([Supabase][3])

Also, I'd keep the first version on Supabase's free tier and monitor storage/realtime usage. For this single-clan use case, the current limits are comfortably sized for the initial deployment; screenshot storage is the resource most worth monitoring. ([Supabase][1])

[1]: https://supabase.com/docs/guides/platform/billing-on-supabase?utm_source=chatgpt.com "About billing on Supabase | Supabase Docs"
[2]: https://supabase.com/docs/guides/auth?utm_source=chatgpt.com "Auth | Supabase Docs"
[3]: https://supabase.com/docs/guides/database/postgres/row-level-security?utm_source=chatgpt.com "Row Level Security | Supabase Docs"
[4]: https://supabase.com/docs/guides/storage/security/access-control?utm_source=chatgpt.com "Storage Access Control | Supabase Docs"
[5]: https://supabase.com/docs/guides/database/secure-data?utm_source=chatgpt.com "Securing your data | Supabase Docs"
[6]: https://supabase.com/docs/guides/realtime/authorization?utm_source=chatgpt.com "Realtime Authorization | Supabase Docs"
[7]: https://supabase.com/docs/guides/realtime/limits?utm_source=chatgpt.com "Realtime Limits | Supabase Docs"
[8]: https://supabase.com/docs/guides/auth/architecture?utm_source=chatgpt.com "Auth architecture | Supabase Docs"
