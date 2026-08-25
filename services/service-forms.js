(() => {
  "use strict";

  const initializedForms = new WeakSet();
  const startedForms = new WeakSet();
  const widgetIds = new WeakMap();

  function setStatus(form, message, state = "") {
    const status = form.querySelector("[data-form-status], #formStatus");
    if (!status) {
      return;
    }
    status.textContent = message;
    status.dataset.state = state;
  }

  function track(form, eventName) {
    void window.OESAnalytics?.track(eventName, {
      form_type: form.dataset.oesServiceForm || "service",
    });
  }

  function markStarted(form) {
    if (startedForms.has(form)) {
      return;
    }
    startedForms.add(form);
    track(form, "service_form_start");
  }

  function formspreeError(payload) {
    const messages = Array.isArray(payload?.errors)
      ? payload.errors.map((error) => error?.message).filter(Boolean)
      : [];
    return messages.join(" ") || "Your request could not be sent. Please check the form and try again.";
  }

  function resetTurnstile(form) {
    const widgetId = widgetIds.get(form);
    if (widgetId !== undefined && typeof window.turnstile?.reset === "function") {
      window.turnstile.reset(widgetId);
    }
  }

  function renderTurnstileWidgets() {
    if (typeof window.turnstile?.render !== "function") {
      return;
    }

    document.querySelectorAll("form[data-oes-service-form]").forEach((form) => {
      const container = form.querySelector("[data-oes-turnstile]");
      if (!container || widgetIds.has(form) || !container.dataset.sitekey) {
        return;
      }

      const widgetId = window.turnstile.render(container, {
        sitekey: container.dataset.sitekey,
        action: "service_request",
        theme: "auto",
        size: "flexible",
        "error-callback": () => {
          setStatus(form, "Bot verification could not load. Please retry before sending.", "error");
        },
        "expired-callback": () => {
          setStatus(form, "Bot verification expired. Please complete it again.", "error");
        },
      });
      widgetIds.set(form, widgetId);
    });
  }

  async function submitForm(form) {
    if (form.dataset.submitting === "true") {
      return;
    }

    if (!form.checkValidity()) {
      setStatus(form, "Please complete the required fields and correct any errors.", "error");
      form.reportValidity();
      return;
    }

    const turnstileContainer = form.querySelector("[data-oes-turnstile]");
    const turnstileToken = form.querySelector('[name="cf-turnstile-response"]')?.value;
    if (turnstileContainer && !turnstileToken) {
      setStatus(form, "Please complete the bot verification before sending.", "error");
      return;
    }

    const submitButton = form.querySelector('[type="submit"]');
    const originalLabel = submitButton?.textContent || "Submit";
    form.dataset.submitting = "true";
    form.setAttribute("aria-busy", "true");
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending…";
    }
    setStatus(form, "Sending your request…", "pending");

    try {
      const response = await fetch(form.action, {
        method: form.method || "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (!response.ok) {
        throw new Error(formspreeError(payload));
      }

      track(form, "service_form_submit");
      form.reset();
      setStatus(form, "Thanks — your request was sent successfully.", "success");
    } catch (error) {
      setStatus(
        form,
        error instanceof Error ? error.message : "Your request could not be sent. Please try again.",
        "error",
      );
    } finally {
      resetTurnstile(form);
      form.dataset.submitting = "false";
      form.removeAttribute("aria-busy");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel;
      }
    }
  }

  function initializeForm(form) {
    if (initializedForms.has(form)) {
      return;
    }
    initializedForms.add(form);

    form.addEventListener("input", () => markStarted(form), { once: true });
    form.addEventListener("change", () => markStarted(form), { once: true });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitForm(form);
    });
    form.addEventListener("reset", () => {
      setStatus(form, "", "");
      resetTurnstile(form);
    });
  }

  document.querySelectorAll("form[data-oes-service-form]").forEach(initializeForm);
  window.oesTurnstileReady = renderTurnstileWidgets;
  renderTurnstileWidgets();
})();
