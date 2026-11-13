(function () {
  const cfg = window.HACKATHON_CONFIG;
  const $ = (s) => document.querySelector(s);

  document.querySelectorAll("[data-cfg]").forEach((el) => {
    el.textContent = cfg[el.dataset.cfg];
  });

  // Graduation years
  const gy = $("#graduation_year");
  const now = new Date().getFullYear();
  gy.innerHTML = '<option value="">Select…</option>';
  for (let y = now - 3; y <= now + 5; y++) gy.add(new Option(String(y), String(y)));

  // Skill levels
  const levels = ["None", "Beginner", "Comfortable", "Strong", "Expert"];
  document.querySelectorAll("select.level").forEach((sel) => {
    levels.forEach((l, i) => sel.add(new Option(l, String(i))));
  });

  // Skill chips
  const skills = [
    "Tool / function calling", "RAG & vector search", "Evals & testing", "Prompt engineering",
    "Multi-agent systems", "Voice AI", "APIs & backend", "Frontend", "SQL & data",
    "CI/CD & Git workflows", "Cloud (AWS / GCP / Azure)", "ML / fine-tuning",
  ];
  const chips = $("#skills");
  skills.forEach((s) => {
    const l = document.createElement("label");
    l.className = "chip";
    const i = document.createElement("input");
    i.type = "checkbox"; i.name = "skills"; i.value = s;
    const sp = document.createElement("span");
    sp.textContent = s;
    l.append(i, sp);
    chips.append(l);
  });

  // Character counters
  document.querySelectorAll(".counter").forEach((c) => {
    const ta = document.getElementById(c.dataset.for);
    const upd = () => (c.textContent = `${ta.value.length} / ${ta.maxLength}`);
    ta.addEventListener("input", upd);
    upd();
  });

  const form = $("#reg-form");
  const err = $("#form-error");
  const showError = (msg) => {
    err.textContent = msg;
    err.classList.add("show");
    err.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const clean = (v) => {
    v = (v || "").trim();
    return v === "" ? null : v;
  };
  const cleanUrl = (v) => {
    v = clean(v);
    if (!v) return null;
    return /^https?:\/\//i.test(v) ? v : "https://" + v;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.classList.remove("show");
    const fd = new FormData(form);

    // Validation
    const missing = [];
    if (!clean(fd.get("full_name"))) missing.push("full name");
    const email = clean(fd.get("email"));
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) missing.push("a valid email");
    if (!clean(fd.get("university"))) missing.push("university");
    if (!fd.get("degree_level")) missing.push("degree");
    if (!fd.get("graduation_year")) missing.push("graduation year");
    if (!fd.get("llm_experience")) missing.push("LLM experience");
    if ((fd.get("project_description") || "").trim().length < 20) missing.push("project description (20+ characters)");
    if ((fd.get("why_join") || "").trim().length < 20) missing.push("why you want to join (20+ characters)");
    if (!fd.get("consent")) missing.push("consent");
    if (missing.length) return showError("Please complete: " + missing.join(", ") + ".");

    const payload = {
      full_name: clean(fd.get("full_name")),
      email: email.toLowerCase(),
      phone: clean(fd.get("phone")),
      location: clean(fd.get("location")),
      work_authorized: !!fd.get("work_authorized"),
      university: clean(fd.get("university")),
      degree_level: fd.get("degree_level"),
      major: clean(fd.get("major")),
      graduation_year: parseInt(fd.get("graduation_year"), 10),
      python_level: parseInt(fd.get("python_level"), 10) || 0,
      javascript_level: parseInt(fd.get("javascript_level"), 10) || 0,
      llm_experience: fd.get("llm_experience"),
      skills: fd.getAll("skills"),
      hackathons_count: Math.min(100, Math.max(0, parseInt(fd.get("hackathons_count"), 10) || 0)),
      github_url: cleanUrl(fd.get("github_url")),
      linkedin_url: cleanUrl(fd.get("linkedin_url")),
      portfolio_url: cleanUrl(fd.get("portfolio_url")),
      project_description: fd.get("project_description").trim(),
      why_join: fd.get("why_join").trim(),
      team_status: fd.get("team_status"),
      dietary_needs: clean(fd.get("dietary_needs")),
      consent: true,
    };

    const btn = $("#submit-btn");
    btn.disabled = true;
    btn.textContent = "Submitting…";
    try {
      const res = await fetch(`${cfg.supabaseUrl}/rest/v1/hackathon_registrations`, {
        method: "POST",
        headers: {
          apikey: cfg.supabaseKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      });
      if (res.status === 409) {
        return showError("An application with this email already exists. If you need to change it, contact the organizers.");
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error(body);
        return showError("Something went wrong submitting your application. Please check your answers and try again.");
      }
      form.hidden = true;
      $("#success-name").textContent = payload.full_name.split(" ")[0];
      $("#success").hidden = false;
      $("#success").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (ex) {
      console.error(ex);
      showError("Network error. Please check your connection and try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Submit application";
    }
  });
})();
