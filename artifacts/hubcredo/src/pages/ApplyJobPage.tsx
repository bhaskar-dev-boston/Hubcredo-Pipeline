import React, { useState } from "react";

// Route this at /apply/job in your router (App.tsx)
// e.g. <Route path="/apply/job" component={ApplyJobPage} />

const WEBHOOK_URL = "https://shreyahubcredo.app.n8n.cloud/webhook-test/apply-job";

const COUNTRY_CODES = [
  { code: "+91", flag: "🇮🇳" },
  { code: "+1", flag: "🇺🇸" },
  { code: "+44", flag: "🇬🇧" },
];

const NAME_REGEX = /^[A-Za-z\s'-]+$/;
const PHONE_REGEX = /^\d{10}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINKEDIN_REGEX = /^https?:\/\/(www\.)?linkedin\.com\/.+$/i;

function validateField(field, value) {
  switch (field) {
    case "firstName":
      if (!value.trim()) return "First name is required.";
      if (!NAME_REGEX.test(value.trim()))
        return "First name must only contain letters.";
      return "";
    case "lastName":
      if (!value.trim()) return "Last name is required.";
      if (!NAME_REGEX.test(value.trim()))
        return "Last name must only contain letters.";
      return "";
    case "email":
      if (!value.trim()) return "Email is required.";
      if (!EMAIL_REGEX.test(value.trim())) return "Enter a valid email address.";
      return "";
    case "phone":
      if (!value.trim()) return "Phone number is required.";
      if (!PHONE_REGEX.test(value.trim())) return "Phone number must be exactly 10 digits.";
      return "";
    case "linkedin":
      if (!value.trim()) return "LinkedIn URL is required.";
      if (!LINKEDIN_REGEX.test(value.trim()))
        return "Enter a valid LinkedIn profile URL (e.g. https://linkedin.com/in/...).";
      return "";
    default:
      return "";
  }
}

export default function ApplyJobPage() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    countryCode: "+91",
    phone: "",
    linkedin: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [resume, setResume] = useState(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [formError, setFormError] = useState("");

  const update = (field) => (e) => {
    let value = e.target.value;
    if (field === "phone") {
      value = value.replace(/\D/g, "").slice(0, 10); // digits only, max 10
    }
    setForm((f) => ({ ...f, [field]: value }));
    if (touched[field]) {
      setFieldErrors((fe) => ({ ...fe, [field]: validateField(field, value) }));
    }
  };

  const handleBlur = (field) => () => {
    setTouched((t) => ({ ...t, [field]: true }));
    setFieldErrors((fe) => ({ ...fe, [field]: validateField(field, form[field]) }));
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setFormError("Please upload your resume as a PDF.");
      return;
    }
    setFormError("");
    setResume(file);
    setFileName(file.name);
  };

  const runFullValidation = () => {
    const fields = ["firstName", "lastName", "email", "phone", "linkedin"];
    const errors = {};
    fields.forEach((f) => {
      errors[f] = validateField(f, form[f]);
    });
    setFieldErrors(errors);
    setTouched(fields.reduce((acc, f) => ({ ...acc, [f]: true }), {}));
    return Object.values(errors).every((v) => !v);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const isValid = runFullValidation();
    if (!isValid) {
      setFormError("Please fix the errors above before submitting.");
      return;
    }
    if (!resume) {
      setFormError("Please upload your resume.");
      return;
    }

    setFormError("");
    setStatus("submitting");

    try {
      const payload = new FormData();
      payload.append("firstName", form.firstName.trim());
      payload.append("lastName", form.lastName.trim());
      payload.append("email", form.email.trim());
      payload.append("phone", `${form.countryCode}${form.phone}`);
      payload.append("linkedin", form.linkedin.trim());
      payload.append("resume", resume, resume.name);

      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        body: payload,
      });

      if (!res.ok) throw new Error(`Webhook returned ${res.status}`);

      setStatus("success");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setFormError("Something went wrong submitting your application. Please try again.");
    }
  };

  return (
    <div className="ajp-page">
      <style>{`
        .ajp-page {
          min-height: 100vh;
          min-height: 100dvh;
          height: 100vh;
          height: 100dvh;
          width: 100%;
          overflow: hidden;
          background:
            radial-gradient(circle at 75% 30%, rgba(124,92,255,0.18), transparent 45%), #0A0A1F;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          padding: clamp(6px, 2vh, 24px) clamp(8px, 3vw, 20px);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .ajp-card {
          width: 100%;
          max-width: 480px;
          max-height: 100%;
          overflow: hidden;
          background: #F4F5FB;
          border-radius: clamp(10px, 2.5vw, 20px);
          padding: clamp(10px, 2.4vh, 30px) clamp(14px, 4vw, 32px);
          box-shadow: 0 30px 80px rgba(0,0,0,0.45);
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
        }
        .ajp-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: clamp(6px, 1.6vh, 20px);
          flex-shrink: 0;
        }
       
        .ajp-title {
          font-size: clamp(16px, 3vh, 24px);
          font-weight: 700;
          margin: 0;
          color: #14142B;
        }
        .ajp-sub {
          color: #6E7191;
          font-size: clamp(11px, 2vh, 14px);
          margin: 0 0 clamp(6px, 1.6vh, 20px);
        }
        .ajp-row {
          display: flex;
          gap: 12px;
        }
        .ajp-field {
          flex: 1;
          min-width: 0;
          margin-bottom: clamp(4px, 1.1vh, 14px);
        }
        .ajp-field.ajp-field-error {
          margin-bottom: 2px;
        }
        .ajp-label {
          display: block;
          font-size: clamp(10px, 1.8vh, 13px);
          font-weight: 500;
          color: #14142B;
          margin-bottom: clamp(2px, 0.6vh, 6px);
        }
        .ajp-input {
          width: 100%;
          box-sizing: border-box;
          padding: clamp(4px, 1.1vh, 11px) 12px;
          border-radius: 10px;
          font-size: clamp(11px, 1.9vh, 14px);
          color: #14142B;
          outline: none;
          background: #fff;
          border: 1.5px solid #E1E2F0;
        }
        .ajp-input.ajp-input-error {
          border: 1.5px solid #E5484D;
        }
        .ajp-error-text {
          color: #E5484D;
          font-size: clamp(9px, 1.5vh, 12px);
          margin: clamp(2px, 0.6vh, 4px) 0 clamp(6px, 1.1vh, 12px);
        }
        .ajp-upload {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1.5px dashed #C4C6E0;
          border-radius: 10px;
          padding: clamp(6px, 1.4vh, 14px);
          font-size: clamp(10px, 1.8vh, 14px);
          color: #6E7191;
          cursor: pointer;
          background: #fff;
          text-align: center;
        }
        .ajp-submit {
          width: 100%;
          margin-top: clamp(4px, 1vh, 12px);
          padding: clamp(6px, 1.6vh, 14px);
          border-radius: 10px;
          border: none;
          font-size: clamp(12px, 2vh, 15px);
          font-weight: 600;
          color: #fff;
          background: linear-gradient(135deg, #4C6FFF, #7C5CFF);
        }
        .ajp-submit:disabled {
          cursor: not-allowed;
          background: #9CA3D4;
        }
        .ajp-disclaimer {
          font-size: clamp(9px, 1.4vh, 12px);
          color: #9A9CB8;
          margin-top: clamp(4px, 1.1vh, 14px);
          line-height: 1.35;
        }
        @media (max-width: 380px) {
          .ajp-row {
            flex-direction: column;
            gap: 0;
          }
        }
      `}</style>

      <div className="ajp-card">
        {status === "success" ? (
          <SuccessState />
        ) : (
          <>
            <div className="ajp-brand">
              <img
  src="/favicon.svg"
  alt="HubCredo"
  style={{ width: 210, height: 90, objectFit: "contain", marginRight: "auto", marginLeft: "auto" }}
/>
            </div>

            <h1 className="ajp-title"></h1>
            <p className="ajp-sub">
              Apply below and we'll get back to you soon.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <div className="ajp-row">
                <Field label="First name" error={touched.firstName && fieldErrors.firstName}>
                  <input
                    className={`ajp-input ${touched.firstName && fieldErrors.firstName ? "ajp-input-error" : ""}`}
                    placeholder="Enter your first name"
                    value={form.firstName}
                    onChange={update("firstName")}
                    onBlur={handleBlur("firstName")}
                  />
                </Field>
                <Field label="Last name" error={touched.lastName && fieldErrors.lastName}>
                  <input
                    className={`ajp-input ${touched.lastName && fieldErrors.lastName ? "ajp-input-error" : ""}`}
                    placeholder="Enter your last name"
                    value={form.lastName}
                    onChange={update("lastName")}
                    onBlur={handleBlur("lastName")}
                  />
                </Field>
              </div>

              <Field label="Email" error={touched.email && fieldErrors.email}>
                <input
                  type="email"
                  className={`ajp-input ${touched.email && fieldErrors.email ? "ajp-input-error" : ""}`}
                  placeholder="Enter your email address"
                  value={form.email}
                  onChange={update("email")}
                  onBlur={handleBlur("email")}
                />
              </Field>

              <Field label="Phone number" error={touched.phone && fieldErrors.phone}>
                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={form.countryCode}
                    onChange={update("countryCode")}
                    className="ajp-input"
                    style={{ width: 92, flex: "none" }}
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code}
                      </option>
                    ))}
                  </select>
                  <input
                    className={`ajp-input ${touched.phone && fieldErrors.phone ? "ajp-input-error" : ""}`}
                    style={{ flex: 1 }}
                    placeholder="10-digit phone number"
                    inputMode="numeric"
                    maxLength={10}
                    value={form.phone}
                    onChange={update("phone")}
                    onBlur={handleBlur("phone")}
                  />
                </div>
              </Field>

              <Field label="LinkedIn profile URL" error={touched.linkedin && fieldErrors.linkedin}>
                <input
                  className={`ajp-input ${touched.linkedin && fieldErrors.linkedin ? "ajp-input-error" : ""}`}
                  placeholder="https://linkedin.com/in/your-profile"
                  value={form.linkedin}
                  onChange={update("linkedin")}
                  onBlur={handleBlur("linkedin")}
                />
              </Field>

              <Field label="Upload your resume (in English)">
                <label className="ajp-upload">
                  ⬆ {fileName || "Click to upload or drag & drop (.pdf)"}
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFile}
                    style={{ display: "none" }}
                  />
                </label>
              </Field>

              {formError && <p className="ajp-error-text">{formError}</p>}

              <button type="submit" disabled={status === "submitting"} className="ajp-submit">
                {status === "submitting" ? "Submitting..." : "Apply"}
              </button>

              <p className="ajp-disclaimer">
                By clicking "Apply", you confirm you have read and agree to the
                Candidate Terms & Conditions and Candidate Privacy Policy.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function SuccessState() {
  return (
    <div style={{ textAlign: "center", padding: "24px 8px" }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #4C6FFF, #7C5CFF)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 20px",
          color: "#fff",
          fontSize: 26,
        }}
      >
        ✓
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#14142B", margin: "0 0 8px" }}>
        Thanks for applying
      </h2>
      <p style={{ color: "#6E7191", fontSize: 14, lineHeight: 1.6 }}>
        You have successfully applied to this job. We will get back to you soon.
      </p>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div className={`ajp-field ${error ? "ajp-field-error" : ""}`}>
      <label className="ajp-label">{label}</label>
      {children}
      {error && <p className="ajp-error-text">{error}</p>}
    </div>
  );
}