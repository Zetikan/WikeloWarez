# Wikelo Warez

A lightweight static experience that mirrors the feel of wikelotrades.com while pulling live data from the Star Citizen wiki.

## Pages

- **index.html** — Catalog of every Wikelo item pulled from `Category:Wikelo` with images and prices.
- **calculator.html** — Inventory-style ingredient calculator that surfaces craftable items and lets you pin favorites.

## How it works

The pages call `https://starcitizen.tools/api.php` directly from the browser. Item details are parsed from page content (images, price rows, and ingredient sections) so the UI stays in sync with the wiki.

Simply open the HTML files in a browser to use the experience.
