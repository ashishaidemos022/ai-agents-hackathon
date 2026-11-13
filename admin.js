(function () {
  const cfg = window.HACKATHON_CONFIG;
  const $ = (s) => document.querySelector(s);
  const KEY = "hackathon_admin_passcode";
  const LLM = { none: "Not yet", used_apis: "Used APIs", built_agents: "Built agents", shipped_production: "Shipped" };
  const DEG = { bachelors: "Bachelor's", masters: "Master's", phd: "PhD", bootcamp: "Bootcamp", other: "Other" };
  const LVL = ["None", "Beginner", "Comfortable", "Strong", "Expert"];
  let rows = [];
  let open = null;

  const store = {
    get: () => { try { return sessionStorage.getItem(KEY); } catch { return null; } },
    set: (v) => { try { sessionStorage.setItem(KEY, v); } catch {} },
    clear: () => { try { sessionStorage.removeItem(KEY); } catch {} },
  };
  let passcode = store.get();

  async function rpc(fn, args) {
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: cfg.supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const e = new Error((body && body.message) || res.statusText);
      e.code = body && body.code;
      throw e;
    }
    return body;
  }

  // ---- DOM helpers (all applicant data goes through textContent, never innerHTML) ----
  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v);
    }
    children.flat().forEach((c) => n.append(c instanceof Node ? c : document.createTextNode(c ?? "")));
    return n;
  }
  const safeLink = (url, label) => {
    if (!url || !/^https?:\/\//i.test(url)) return el("span", { class: "muted", text: "—" });
    return el("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: label });
  };

  // ---- Auth ----
  async function login(p) {
    const ok = await rpc("hackathon_admin_ok", { p_passcode: p });
    if (!ok) throw new Error("Incorrect passcode.");
    passcode = p;
    store.set(p);
    $("#login").hidden = true;
    $("#app").hidden = false;
    $("#capacity").value = cfg.capacity;
    await load();
  }
  $("#login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const er = $("#login-error");
    er.classList.remove("show");
    try { await login($("#passcode").value); }
    catch (ex) { er.textContent = ex.message; er.classList.add("show"); }
  });
  $("#logout").addEventListener("click", () => { store.clear(); location.reload(); });

  // ---- Data ----
  async function load() {
    rows = await rpc("hackathon_admin_list", { p_passcode: passcode });
    render();
  }
  $("#refresh").addEventListener("click", load);
  $("#search").addEventListener("input", render);
  $("#filter").addEventListener("change", render);
  $("#capacity").addEventListener("input", render);

  function renderStats() {
    const count = (s) => rows.filter((r) => r.status === s).length;
    const cap = parseInt($("#capacity").value, 10) || cfg.capacity;
    const stats = [
      ["Applicants", rows.length],
      ["Seats", cap],
      ["Invited", count("invited")],
      ["Waitlisted", count("waitlisted")],
      ["Pending", count("pending")],
    ];
    $("#stats").replaceChildren(...stats.map(([k, v]) => el("div", { class: "stat" }, el("b", { text: String(v) }), el("span", { text: k }))));
  }

  function render() {
    renderStats();
    const q = $("#search").value.toLowerCase().trim();
    const f = $("#filter").value;
    const cap = parseInt($("#capacity").value, 10) || cfg.capacity;

    // Cutoff position = the cap-th applicant among non-declined, in rank order
    const eligible = rows.filter((r) => r.status !== "declined");
    const cutoffId = eligible.length > cap ? eligible[cap - 1].id : null;

    const body = $("#rows");
    body.replaceChildren();
    rows
      .filter((r) => !f || r.status === f)
      .filter((r) => !q || [r.full_name, r.email, r.university, r.major, r.location].join(" ").toLowerCase().includes(q))
      .forEach((r) => {
        const tr = el("tr", { class: "main" + (r.id === cutoffId ? " cutoff" : "") },
          el("td", { text: "#" + r.rank }),
          el("td", { class: "score", text: String(r.final_score) }),
          el("td", { text: String(r.auto_score) }),
          el("td", { text: r.reviewer_adjustment > 0 ? "+" + r.reviewer_adjustment : String(r.reviewer_adjustment) }),
          el("td", {}, el("b", { text: r.full_name })),
          el("td", { text: r.university }),
          el("td", { text: String(r.graduation_year) }),
          el("td", { text: LLM[r.llm_experience] || r.llm_experience }),
          el("td", { text: `${r.python_level} / ${r.javascript_level}` }),
          el("td", { text: String((r.skills || []).length) }),
          el("td", {}, el("span", { class: "pill " + r.status, text: r.status })),
          el("td", { text: new Date(r.created_at).toLocaleDateString() }),
        );
        tr.addEventListener("click", () => { open = open === r.id ? null : r.id; render(); });
        body.append(tr);
        if (open === r.id) body.append(detailRow(r));
      });
    if (!body.children.length) body.append(el("tr", {}, el("td", { colspan: "12", class: "muted", text: "No applicants yet." })));
  }

  function detailRow(r) {
    const status = el("select", {});
    ["pending", "invited", "waitlisted", "declined"].forEach((s) => status.add(new Option(s, s, false, s === r.status)));
    const adj = el("input", { type: "number", min: "-20", max: "20", value: String(r.reviewer_adjustment) });
    const notes = el("textarea", { placeholder: "Reviewer notes" });
    notes.value = r.reviewer_notes || "";
    const msg = el("span", { class: "muted" });
    const save = el("button", { class: "btn small", type: "button", text: "Save" });
    save.addEventListener("click", async () => {
      const a = Math.max(-20, Math.min(20, parseInt(adj.value, 10) || 0));
      save.disabled = true;
      try {
        await rpc("hackathon_admin_update", { p_passcode: passcode, p_id: r.id, p_status: status.value, p_adjustment: a, p_notes: notes.value || null });
        await load();
      } catch (ex) { msg.textContent = "Save failed: " + ex.message; save.disabled = false; }
    });

    const section = (h, t) => [el("h4", { text: h }), el("p", { text: t || "—" })];
    const left = el("div", {},
      section("Best thing they've built", r.project_description),
      section("Why they want to join", r.why_join),
      section("Skills", (r.skills || []).join(", ")),
    );
    const right = el("div", {},
      section("Contact", [r.email, r.phone, r.location].filter(Boolean).join(" · ")),
      section("Education", `${DEG[r.degree_level] || r.degree_level}${r.major ? ", " + r.major : ""} · ${r.university} · ${r.graduation_year}`),
      section("Python / JS", `${LVL[r.python_level]} / ${LVL[r.javascript_level]} · ${r.hackathons_count} hackathons`),
      section("Work authorized · Team", `${r.work_authorized ? "Yes" : "No"} · ${r.team_status === "have_team" ? "Has a team" : "Needs a team"}`),
      section("Dietary / accessibility", r.dietary_needs),
      el("h4", { text: "Links" }),
      el("p", {}, safeLink(r.github_url, "GitHub"), "  ", safeLink(r.linkedin_url, "LinkedIn"), "  ", safeLink(r.portfolio_url, "Portfolio")),
      el("h4", { text: "Review" }),
      el("div", { class: "row", style: "margin-bottom:8px" },
        el("div", { class: "field" }, el("label", { text: "Status" }), status),
        el("div", { class: "field" }, el("label", { text: "Score adjustment (±20)" }), adj)),
      notes,
      el("div", { style: "margin-top:8px; display:flex; gap:10px; align-items:center" }, save, msg),
    );
    return el("tr", { class: "detail" }, el("td", { colspan: "12" }, el("div", { class: "detail-grid" }, left, right)));
  }

  $("#apply-cutoff").addEventListener("click", async () => {
    const cap = parseInt($("#capacity").value, 10);
    if (!cap || cap < 1) return;
    if (!confirm(`Invite the top ${cap} applicants and waitlist everyone else (declined stay declined)?`)) return;
    try {
      await rpc("hackathon_admin_apply_cutoff", { p_passcode: passcode, p_capacity: cap });
      await load();
    } catch (ex) { alert("Failed: " + ex.message); }
  });

  $("#export").addEventListener("click", () => {
    const cols = ["rank", "final_score", "auto_score", "reviewer_adjustment", "status", "full_name", "email", "phone", "location",
      "university", "degree_level", "major", "graduation_year", "llm_experience", "python_level", "javascript_level", "skills",
      "hackathons_count", "github_url", "linkedin_url", "portfolio_url", "work_authorized", "team_status", "dietary_needs",
      "project_description", "why_join", "reviewer_notes", "created_at"];
    const esc = (v) => {
      let s = Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // block spreadsheet formula injection
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const a = el("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "hackathon-applicants.csv" });
    a.click();
  });

  if (passcode) login(passcode).catch(() => { store.clear(); passcode = null; });
})();
