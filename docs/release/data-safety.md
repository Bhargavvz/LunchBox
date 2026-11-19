# Google Play Data safety answers

Matches the code and the [privacy policy](https://admin.18-211-99-232.sslip.io/privacy/). All data is encrypted in
transit (HTTPS/WSS). Users can request deletion (in the app, or on the web page). No data is sold or used for ads.

## Parent app (`in.lunchbox.parent`)

| Data type | Collected | Shared | Optional | Purpose |
|---|---|---|---|---|
| Name | Yes | With the rider (first name only) | No | App functionality, account management |
| Phone number | Yes | No (riders never see it) | No | Account management (sign-in by SMS code) |
| Email address | Yes | No | Yes | Account management, receipts |
| Approximate and precise location | Yes | No | Yes | App functionality (place the home pin); not in the background |
| Address (other personal info) | Yes | With the rider | No | App functionality (pickup) |
| Children's name, school, class | Yes | With the rider (first name, class) and school | No | App functionality |
| Photos | Yes | No | Yes | Profile photo |
| Purchase history | Yes | No | No | App functionality (plans, receipts) |
| Payment info (card, UPI) | No — entered on Razorpay's page, never received by LunchBox | — | — | — |
| App interactions, crash logs | No (no analytics or crash SDK in this release) | — | — | — |
| Device or other IDs | Yes (push notification token) | No | No | App functionality (notifications) |

Service providers processing data on LunchBox's behalf (not "sharing" under Play's definition): Google Firebase,
Razorpay, MSG91, Amazon Web Services.

## Rider app (`in.lunchbox.partner`)

| Data type | Collected | Shared | Optional | Purpose |
|---|---|---|---|---|
| Name, phone number | Yes | First name and vehicle with the parent | No | Account management |
| Precise location (background) | Yes, only during an active route | With the parent of the box on the way, and operations | No | App functionality (live tracking, arrival checks) |
| Photos | Yes (handover photo at the school gate) | With the parent and operations | No | App functionality (proof of delivery; deleted after 90 days) |
| Financial info (bank account for payouts) | Entered by operations, not in the app | RazorpayX | — | Payouts |
| Device or other IDs | Yes (push token) | No | No | Notifications |

## Security section

- Data encrypted in transit: **Yes**
- Users can request data deletion: **Yes** (in app and at `/delete-account/`)
- Committed to the Families Policy: **No** (the apps are for parents and riders, not directed at children)
- Independent security review: **No**
