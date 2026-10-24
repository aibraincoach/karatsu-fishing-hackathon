#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "sample_data.json"), "utf8"));
const samples = data.samples;

let people = 0;
let company = 0;
let hours = 0;
let urchins = 0;
let bags = 0;

for (const s of samples) {
  const p = s.result.people;
  people += p.coop + p.company + p.other;
  company += p.company;
  hours += s.result.hours;
  urchins += s.result.urchins_removed;
  bags += s.result.seed_bags;
}

const expected = { people: 27, company: 16, hours: 8.5, urchins: 1870, bags: 10 };
const actual = { people, company, hours, urchins, bags };

let ok = true;
for (const [k, v] of Object.entries(expected)) {
  if (actual[k] !== v) {
    console.error(`Mismatch ${k}: expected ${v}, got ${actual[k]}`);
    ok = false;
  }
}

if (!ok) process.exit(1);
console.log("sample_data.json sums OK");
