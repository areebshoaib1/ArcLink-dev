Based on what's built, here is the exact workflow of ArcLink:

---

**Freelancer side (creating a request)**

1. Opens ArcLink → Landing page with "Get paid in USDC instantly"
2. Taps "Create payment link" → Create screen
3. Connects their wallet (MetaMask or any Arc-compatible wallet) — this becomes the recipient address, funds go directly here
4. Fills in: Amount (USDC), Description, Client name, Client email (optional), toggles "Email me when paid"
5. Taps "Generate payment link" → Link Ready screen with a shareable URL + QR code
6. Shares the link via WhatsApp, email, text, or any channel

---

**Client side (paying)**

7. Opens the link in any browser → Pay page
8. Sees: who is requesting, the amount, the description, a QR code
9. **State 1 — Pre-connect:** taps "Connect wallet", picks MetaMask or Coinbase Wallet
10. **State 2 — Post-connect:** their address shows as "Paying from: 0x..." and the button becomes "Pay $X USDC"
11. If they're on the wrong chain, they see "Switch to Arc Testnet" first
12. Taps Pay → approves the transaction in their wallet → USDC ERC-20 transfer executes on Arc Testnet
13. On confirmation → auto-redirects to Receipt

---

**Receipt (both sides)**

14. Receipt shows: green checkmark, "[Client] just paid you $X USDC", full detail card (amount, description, from address, to address, network, transaction hash, timestamp)
15. Three actions: View on Arc Explorer, Download Receipt, Back to Dashboard

---

**Dashboard (freelancer's home base)**

16. Shows three stats: Total received ($), Pending ($), Links created (count)
17. Every link created is listed with description, client name, amount, and Paid/Pending badge
18. Paid links tap through to their receipt
19. "+" button creates a new link

---

**The two gaps worth knowing about**

- The client needs a crypto wallet today. Your roadmap calls out Circle Wallets to remove that friction for non-crypto clients — that would be the biggest UX unlock for v2.
- There is no backend. Payment links are stored in the browser's localStorage, so they only appear on the device that created them. A lightweight backend (or even a shared URL-encoded link with all data in the params) would make links device-independent.
