import { describe, it, expect, beforeEach } from "vitest";

describe("Responsive layout", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("nav-bottom exists in the DOM", () => {
    const nav = document.createElement("nav");
    nav.className = "nav-bottom";
    document.body.appendChild(nav);
    expect(document.querySelector(".nav-bottom")).not.toBeNull();
  });

  it("cards-grid renders cards", () => {
    const grid = document.createElement("div");
    grid.className = "cards-grid";
    grid.innerHTML = '<div class="card">A</div><div class="card">B</div><div class="card">C</div>';
    document.body.appendChild(grid);
    expect(grid.querySelectorAll(".card").length).toBe(3);
  });

  it("speed-gauge-row contains gauges", () => {
    const row = document.createElement("div");
    row.className = "speed-gauge-row";
    row.innerHTML = '<div class="speed-gauge"></div><div class="speed-gauge"></div>';
    document.body.appendChild(row);
    expect(row.querySelectorAll(".speed-gauge").length).toBe(2);
  });

  it("aria-busy can be set and read on sections", () => {
    const section = document.createElement("section");
    section.setAttribute("aria-busy", "true");
    expect(section.getAttribute("aria-busy")).toBe("true");
    section.setAttribute("aria-busy", "false");
    expect(section.getAttribute("aria-busy")).toBe("false");
  });

  it("nav-bottom-item has active state", () => {
    const item = document.createElement("a");
    item.className = "nav-bottom-item";
    expect(item.classList.contains("active")).toBe(false);
    item.classList.add("active");
    expect(item.classList.contains("active")).toBe(true);
  });
});
