import { useState, useEffect, useCallback } from "react";
import { Building2, Plus, Search, X, Play } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SlideOver } from "@/components/recruit/SlideOver";
import { EmptyState } from "@/components/recruit/EmptyState";
import { getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts?.headers ?? {}),
    },
  });
}

interface Client {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  job_title?: string | null;
  linkedin_url?: string | null;
  review_status?: string | null;
  open_roles_count?: number;
  fee_model?: string | null;
  updated_at?: string | null;
}

// ---- Client Sourcing types ----
// These are sourced recruiter / TA contacts returned by the API.
interface ClientContact {
  id: string;
  user_id?: string | null;

  // NOTE:
  // Despite the existing database field name, this is currently
  // the LinkedIn profile URL of the PERSON.
  company_linkedin_url?: string | null;

  // Actual person name returned by your scraper/API
  first_name?: string | null;
  last_name?: string | null;

  company_name?: string | null;
  about?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;

  contact_email?: string | null;
  contact_email_status?: string | null;

  hiring_signal_score?: number | null;
  scraped_at?: string | null;
}

/**
 * Get the contact's name.
 *
 * Priority:
 * 1. first_name + last_name from API
 * 2. first_name only
 * 3. last_name only
 * 4. LinkedIn URL slug
 * 5. Email
 * 6. Unknown contact
 */
function getContactName(contact: ClientContact): string {
  const firstName = contact.first_name?.trim() || "";
  const lastName = contact.last_name?.trim() || "";

  // Best source: actual scraped name
  const fullName = [firstName, lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName) {
    return fullName;
  }

  // Fallback: first name only
  if (firstName) {
    return firstName;
  }

  // Fallback: last name only
  if (lastName) {
    return lastName;
  }

  // Fallback: extract name from LinkedIn URL
  const linkedinUrl = contact.company_linkedin_url?.trim() || "";

  if (linkedinUrl) {
    try {
      const slug = linkedinUrl
        .replace(/\/$/, "")
        .split("/")
        .pop() || "";

      const fallbackName = slug
        .replace(/-\d+$/, "")
        .split("-")
        .filter(Boolean)
        .map(
          word =>
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join(" ")
        .trim();

      if (fallbackName) {
        return fallbackName;
      }
    } catch {
      // Ignore malformed LinkedIn URLs
    }
  }

  // Final fallback
  if (contact.contact_email) {
    return contact.contact_email;
  }

  return "Unknown contact";
}

/**
 * Generate initials from a person's name.
 *
 * Examples:
 * Mayur B.       -> MB
 * Shivam Airi    -> SA
 * Sayali Joshi   -> SJ
 * Karunya        -> KA
 */
function getInitials(name: string): string {
  const cleanName = name.trim();

  if (!cleanName || cleanName === "Unknown contact") {
    return "?";
  }

  const words = cleanName
    .split(/\s+/)
    .map(word => word.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

type TabId = "my-clients" | "find-clients";
type TriggerSource = "linkedin" | "indeed";

const EXPERIENCE_LEVELS = [
  "Entry",
  "Mid-Senior",
  "Director",
  "Executive",
];

export default function Clients() {
  const [tab, setTab] = useState<TabId>("my-clients");

  // ---- My Clients state ----
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [newClient, setNewClient] = useState({
    first_name: "",
    last_name: "",
    company_name: "",
    email: "",
    job_title: "",
  });

  const [saving, setSaving] = useState(false);

  const { toast } = useToast();

  // ---- Client Sourcing state ----
  const [clientContacts, setClientContacts] = useState<ClientContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [addedContactIds, setAddedContactIds] = useState<Set<string>>(
    new Set()
  );
  const [addingContactId, setAddingContactId] = useState<string | null>(null);
  const [addingAllContacts, setAddingAllContacts] = useState(false);

  // ---- Load sourced contacts ----
  const loadClientContacts = useCallback(async () => {
    setContactsLoading(true);

    try {
      const r = await authFetch(`/api/recruit/client-signals`);

      if (r.ok) {
        const data = await r.json();

        // Defensive check in case API doesn't return an array
        if (Array.isArray(data)) {
          setClientContacts(data);
        } else {
          setClientContacts([]);
        }
      } else {
        setClientContacts([]);
      }
    } catch {
      setClientContacts([]);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "find-clients") {
      loadClientContacts();
    }
  }, [tab, loadClientContacts]);

  // ---- Trigger Scrape state ----
  const [showTrigger, setShowTrigger] = useState(false);

  const [triggerSource, setTriggerSource] =
    useState<TriggerSource>("linkedin");

  const [triggerForm, setTriggerForm] = useState({
    keyword: "",
    location: "",
    experience: "Mid-Senior",
    industry: "",
    max_jobs: "100",
  });

  const [triggering, setTriggering] = useState(false);

  // ---- Load existing clients ----
  const load = useCallback(async () => {
    setLoading(true);

    try {
      const qs = search
        ? `?search=${encodeURIComponent(search)}`
        : "";

      const r = await authFetch(`/api/recruit/clients${qs}`);

      if (r.ok) {
        const data = await r.json();

        if (Array.isArray(data)) {
          setClients(data);
        } else {
          setClients([]);
        }
      } else {
        setClients([]);
      }
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Add client ----
  async function addClient() {
    if (!newClient.company_name && !newClient.first_name) {
      toast({
        title: "Company name or first name required",
        variant: "destructive",
      });

      return;
    }

    setSaving(true);

    try {
      const r = await authFetch("/api/recruit/clients", {
        method: "POST",
        body: JSON.stringify(newClient),
      });

      if (r.ok) {
        toast({
          title: "Client added",
        });

        setShowAdd(false);

        setNewClient({
          first_name: "",
          last_name: "",
          company_name: "",
          email: "",
          job_title: "",
        });

        load();
      } else {
        const err = await r.json();

        toast({
          title: "Error",
          description: err.error,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Could not add client",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  // ---- Add sourced contact to pipeline ----
  async function addContactToPipeline(contact: ClientContact) {
    setAddingContactId(contact.id);

    try {
      const r = await authFetch(
        `/api/recruit/client-signals/${contact.id}/add-to-pipeline`,
        {
          method: "POST",
        }
      );

      if (r.ok) {
        const contactName = getContactName(contact);

        toast({
          title: `${contactName} added to pipeline`,
        });

        setAddedContactIds(prev => {
          const next = new Set(prev);
          next.add(contact.id);
          return next;
        });

        if (tab === "my-clients") {
          load();
        }
      } else {
        const err = await r.json();

        toast({
          title: "Error",
          description: err.error,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Could not add contact to pipeline",
        variant: "destructive",
      });
    } finally {
      setAddingContactId(null);
    }
  }

  // ---- Dismiss sourced contact ----
  async function dismissContact(contact: ClientContact) {
    setClientContacts(prev =>
      prev.filter(c => c.id !== contact.id)
    );

    try {
      await authFetch(
        `/api/recruit/client-signals/${contact.id}`,
        {
          method: "DELETE",
        }
      );
    } catch {
      // Non-critical; contact may resurface next scrape
    }
  }

  // ---- Add all contacts ----
  async function addAllContactsToPipeline() {
    const unadded = clientContacts.filter(
      c => !addedContactIds.has(c.id)
    );

    if (unadded.length === 0) {
      toast({
        title: "All contacts already added to pipeline",
        variant: "destructive",
      });

      return;
    }

    setAddingAllContacts(true);

    let successCount = 0;

    try {
      for (const contact of unadded) {
        try {
          const r = await authFetch(
            `/api/recruit/client-signals/${contact.id}/add-to-pipeline`,
            {
              method: "POST",
            }
          );

          if (r.ok) {
            successCount++;

            setAddedContactIds(prev => {
              const next = new Set(prev);
              next.add(contact.id);
              return next;
            });
          }
        } catch {
          // Continue adding other contacts
        }
      }

      toast({
        title: `${successCount} contact${
          successCount !== 1 ? "s" : ""
        } added to pipeline`,
      });

      if (tab === "my-clients") {
        load();
      }
    } finally {
      setAddingAllContacts(false);
    }
  }

  // ---- Reset scrape form ----
  function resetTriggerForm() {
    setTriggerForm({
      keyword: "",
      location: "",
      experience: "Mid-Senior",
      industry: "",
      max_jobs: "100",
    });

    setTriggerSource("linkedin");
  }

  // ---- Trigger scrape ----
  async function submitTrigger() {
    if (!triggerForm.keyword.trim()) {
      toast({
        title: "Keyword is required",
        variant: "destructive",
      });

      return;
    }

    setTriggering(true);

    try {
      const r = await authFetch(
        "/api/recruit/job-signals/trigger",
        {
          method: "POST",
          body: JSON.stringify({
            source: triggerSource,
            keyword: triggerForm.keyword.trim(),
            location:
              triggerForm.location.trim() || undefined,
            experience:
              triggerForm.experience || undefined,
            industry:
              triggerForm.industry.trim() || undefined,
            max_jobs: triggerForm.max_jobs
              ? Number(triggerForm.max_jobs)
              : undefined,
          }),
        }
      );

      if (r.ok) {
        toast({
          title: `${
            triggerSource === "linkedin"
              ? "LinkedIn"
              : "Indeed"
          } scrape triggered`,
          description:
            "New contacts will appear once the scrape completes.",
        });

        setShowTrigger(false);
        resetTriggerForm();

        // Refresh contacts after scrape trigger
        // The workflow may still be processing, so this only
        // refreshes the current API state.
        loadClientContacts();
      } else {
        const err = await r.json();

        toast({
          title: "Error",
          description: err.error,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description:
          "Could not reach the scraping workflow",
        variant: "destructive",
      });
    } finally {
      setTriggering(false);
    }
  }

  return (
    <DashboardLayout>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "28px 24px",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                color: "#0A0A0A",
                margin: 0,
              }}
            >
              Clients
            </h1>

            <p
              style={{
                color: "#64748B",
                margin: "4px 0 0",
                fontSize: "0.9375rem",
              }}
            >
              Manage your hiring clients
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
            }}
          >
            {tab === "find-clients" && (
              <button
                onClick={() => setShowTrigger(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 18px",
                  borderRadius: 10,
                  border: "1px solid #E2E8F0",
                  background: "#fff",
                  color: "#0A0A0A",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
              >
                <Play
                  style={{
                    width: 14,
                    height: 14,
                  }}
                />

                Trigger scrape
              </button>
            )}

            <button
              onClick={() => setShowAdd(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 18px",
                borderRadius: 10,
                border: "none",
                background: "#2563EB",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              <Plus
                style={{
                  width: 15,
                  height: 15,
                }}
              />

              Add client
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 20,
            borderBottom: "1px solid #E2E8F0",
            paddingBottom: 0,
          }}
        >
          {(
            [
              ["my-clients", "My Clients"],
              ["find-clients", "Find Clients"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: "9px 18px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: 600,
                color:
                  tab === id ? "#2563EB" : "#64748B",
                borderBottom:
                  tab === id
                    ? "2px solid #2563EB"
                    : "2px solid transparent",
                marginBottom: -1,
                transition: "all .15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ===================================================== */}
        {/* MY CLIENTS                                            */}
        {/* ===================================================== */}

        {tab === "my-clients" && (
          <>
            {/* Search */}
            <div
              style={{
                position: "relative",
                maxWidth: 360,
                marginBottom: 20,
              }}
            >
              <Search
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 15,
                  height: 15,
                  color: "#9CA3AF",
                }}
              />

              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search clients…"
                style={{
                  width: "100%",
                  paddingLeft: 36,
                  paddingRight: 12,
                  paddingTop: 9,
                  paddingBottom: 9,
                  borderRadius: 10,
                  border: "1px solid #E2E8F0",
                  fontSize: "0.875rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {loading ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    style={{
                      height: 84,
                      borderRadius: 12,
                      background: "#F1F5F9",
                    }}
                  />
                ))}
              </div>
            ) : clients.length === 0 ? (
              <EmptyState
                icon={Building2}
                message="No clients yet. Add your first hiring client to get started."
                action={{
                  label: "Add client",
                  onClick: () => setShowAdd(true),
                }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {clients.map(client => {
                  const contactName =
                    [
                      client.first_name,
                      client.last_name,
                    ]
                      .filter(Boolean)
                      .join(" ")
                      .trim() ||
                    client.email ||
                    "Unknown contact";

                  const initials = getInitials(contactName);

                  return (
                    <div
                      key={client.id}
                      onClick={() => setSelected(client)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        padding: "16px 18px",
                        background: "#fff",
                        border: "1px solid #E2E8F0",
                        borderRadius: 12,
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          background: "#F1F5F9",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontWeight: 700,
                          color: "#475569",
                          fontSize: "0.8125rem",
                        }}
                      >
                        {initials}
                      </div>

                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 4,
                          }}
                        >
                          <p
                            style={{
                              margin: 0,
                              fontWeight: 700,
                              color: "#0A0A0A",
                              fontSize: "0.9375rem",
                            }}
                          >
                            {client.company_name ||
                              "Untitled client"}
                          </p>

                          {client.review_status && (
                            <span
                              style={{
                                fontSize: "0.6875rem",
                                fontWeight: 700,
                                color: "#2563EB",
                                background: "#EFF6FF",
                                padding: "1px 7px",
                                borderRadius: 6,
                              }}
                            >
                              {client.review_status}
                            </span>
                          )}
                        </div>

                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.875rem",
                            color: "#374151",
                          }}
                        >
                          {contactName}
                        </p>

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 10,
                            marginTop: 8,
                          }}
                        >
                          {client.job_title && (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                color: "#64748B",
                                background: "#F8FAFC",
                                padding: "4px 8px",
                                borderRadius: 8,
                              }}
                            >
                              {client.job_title}
                            </span>
                          )}

                          {client.email && (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                color: "#64748B",
                                background: "#F8FAFC",
                                padding: "4px 8px",
                                borderRadius: 8,
                              }}
                            >
                              {client.email}
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: 6,
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "#94A3B8",
                          }}
                        >
                          {client.updated_at
                            ? new Date(
                                client.updated_at
                              ).toLocaleDateString()
                            : ""}
                        </span>

                        <span
                          style={{
                            fontSize: "0.875rem",
                            fontWeight: 700,
                            color: "#2563EB",
                          }}
                        >
                          {client.open_roles_count ?? 0} open role
                          {client.open_roles_count === 1
                            ? ""
                            : "s"}
                        </span>

                        {client.fee_model && (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              color: "#64748B",
                            }}
                          >
                            {client.fee_model}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ===================================================== */}
        {/* FIND CLIENTS                                         */}
        {/* ===================================================== */}

        {tab === "find-clients" && (
          <div>
            {/* Header */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 16,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3
                style={{
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  color: "#0A0A0A",
                  margin: 0,
                }}
              >
                Sourced contacts
              </h3>

              {clientContacts.length > 0 && (
                <button
                  onClick={addAllContactsToPipeline}
                  disabled={
                    addingAllContacts ||
                    clientContacts.every(c =>
                      addedContactIds.has(c.id)
                    )
                  }
                  style={{
                    padding: "6px 14px",
                    borderRadius: 9,
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    cursor:
                      addingAllContacts ||
                      clientContacts.every(c =>
                        addedContactIds.has(c.id)
                      )
                        ? "default"
                        : "pointer",
                    border: "none",
                    background: "#2563EB",
                    color: "#fff",
                    opacity:
                      addingAllContacts ||
                      clientContacts.every(c =>
                        addedContactIds.has(c.id)
                      )
                        ? 0.6
                        : 1,
                  }}
                >
                  {addingAllContacts
                    ? "Adding all…"
                    : "Add all to pipeline"}
                </button>
              )}
            </div>

            {/* Loading */}
            {contactsLoading ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    style={{
                      height: 84,
                      borderRadius: 12,
                      background: "#F1F5F9",
                    }}
                  />
                ))}
              </div>
            ) : clientContacts.length === 0 ? (
              /* Empty state */
              <div
                style={{
                  background: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: 14,
                  padding: "40px 32px",
                  textAlign: "center",
                }}
              >
                <Building2
                  style={{
                    width: 40,
                    height: 40,
                    color: "#CBD5E1",
                    margin: "0 auto 12px",
                    display: "block",
                  }}
                />

                <h3
                  style={{
                    margin: "0 0 8px",
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: "#374151",
                  }}
                >
                  No sourced contacts yet
                </h3>

                <p
                  style={{
                    color: "#64748B",
                    fontSize: "0.875rem",
                    margin: "0 0 16px",
                  }}
                >
                  Trigger a scrape to start sourcing recruiter
                  and TA contacts at target companies.
                </p>

                <button
                  onClick={() => setShowTrigger(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 18px",
                    borderRadius: 10,
                    border: "none",
                    background: "#2563EB",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "0.875rem",
                  }}
                >
                  <Play
                    style={{
                      width: 14,
                      height: 14,
                    }}
                  />

                  Trigger scrape
                </button>
              </div>
            ) : (
              /* Sourced contacts */
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {clientContacts.map(contact => {
                  // IMPORTANT:
                  // This now uses first_name / last_name from API.
                  const name = getContactName(contact);

                  const initials = getInitials(name);

                  const added = addedContactIds.has(
                    contact.id
                  );

                  return (
                    <div
                      key={contact.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        padding: "16px 18px",
                        background: "#fff",
                        border: "1px solid #E2E8F0",
                        borderRadius: 12,
                      }}
                    >
                      {/* Avatar */}
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          background: "#F1F5F9",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontWeight: 700,
                          color: "#475569",
                          fontSize: "0.8125rem",
                        }}
                      >
                        {initials}
                      </div>

                      {/* Contact information */}
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <p
                            style={{
                              margin: 0,
                              fontWeight: 700,
                              color: "#0A0A0A",
                              fontSize: "0.9375rem",
                            }}
                          >
                            {name}
                          </p>

                          {added && (
                            <span
                              style={{
                                fontSize: "0.6875rem",
                                fontWeight: 700,
                                color: "#2563EB",
                                background: "#EFF6FF",
                                padding: "1px 7px",
                                borderRadius: 6,
                              }}
                            >
                              In pipeline
                            </span>
                          )}
                        </div>

                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.875rem",
                            color: "#374151",
                          }}
                        >
                          {contact.company_name ||
                            "Unknown company"}

                          {contact.location_city && (
                            <span
                              style={{
                                color: "#94A3B8",
                              }}
                            >
                              {" · "}
                              {contact.location_city}
                            </span>
                          )}
                        </p>

                        {contact.contact_email && (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              color: "#64748B",
                            }}
                          >
                            {contact.contact_email}
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexShrink: 0,
                        }}
                      >
                        {contact.company_linkedin_url && (
                          <a
                            href={
                              contact.company_linkedin_url
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: "8px 14px",
                              borderRadius: 9,
                              border:
                                "1px solid #E2E8F0",
                              background: "#fff",
                              color: "#374151",
                              fontWeight: 600,
                              fontSize: "0.8125rem",
                              textDecoration: "none",
                            }}
                          >
                            LinkedIn
                          </a>
                        )}

                        <button
                          onClick={() =>
                            addContactToPipeline(contact)
                          }
                          disabled={
                            addingContactId ===
                              contact.id || added
                          }
                          style={{
                            padding: "8px 14px",
                            borderRadius: 9,
                            border: "none",
                            background: "#0A0A0A",
                            color: "#fff",
                            fontWeight: 600,
                            fontSize: "0.8125rem",
                            cursor: added
                              ? "default"
                              : "pointer",
                            opacity: added ? 0.6 : 1,
                          }}
                        >
                          {added
                            ? "Added"
                            : addingContactId ===
                              contact.id
                            ? "Adding…"
                            : "Add to pipeline"}
                        </button>

                        <button
                          onClick={() =>
                            dismissContact(contact)
                          }
                          title="Dismiss"
                          style={{
                            padding: 8,
                            borderRadius: 9,
                            border:
                              "1px solid #E2E8F0",
                            background: "#fff",
                            color: "#94A3B8",
                            cursor: "pointer",
                            display: "flex",
                          }}
                        >
                          <X
                            style={{
                              width: 14,
                              height: 14,
                            }}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===================================================== */}
      {/* CLIENT DETAIL SLIDE-OVER                              */}
      {/* ===================================================== */}

      <SlideOver
        open={!!selected}
        onClose={() => setSelected(null)}
        title={
          selected?.company_name ||
          [selected?.first_name, selected?.last_name]
            .filter(Boolean)
            .join(" ") ||
          "Client"
        }
        subtitle={selected?.job_title || undefined}
      >
        {selected && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              {[
                {
                  label: "Company",
                  value: selected.company_name,
                },
                {
                  label: "Contact",
                  value:
                    [
                      selected.first_name,
                      selected.last_name,
                    ]
                      .filter(Boolean)
                      .join(" ") || "—",
                },
                {
                  label: "Email",
                  value: selected.email,
                },
                {
                  label: "Title",
                  value: selected.job_title,
                },
                {
                  label: "Open roles",
                  value:
                    selected.open_roles_count?.toString(),
                },
                {
                  label: "Fee model",
                  value: selected.fee_model,
                },
              ].map(({ label, value }) =>
                value ? (
                  <div key={label}>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "#94A3B8",
                        textTransform: "uppercase",
                        letterSpacing: ".06em",
                        margin: "0 0 4px",
                      }}
                    >
                      {label}
                    </p>

                    <p
                      style={{
                        fontSize: "0.9375rem",
                        color: "#0A0A0A",
                        margin: 0,
                      }}
                    >
                      {value}
                    </p>
                  </div>
                ) : null
              )}
            </div>

            {selected.linkedin_url && (
              <a
                href={selected.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#2563EB",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                View LinkedIn profile →
              </a>
            )}
          </div>
        )}
      </SlideOver>

      {/* ===================================================== */}
      {/* ADD CLIENT MODAL                                      */}
      {/* ===================================================== */}

      {showAdd && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.4)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 28,
              maxWidth: 440,
              width: "90%",
              boxShadow:
                "0 20px 60px rgba(0,0,0,.15)",
            }}
          >
            <h3
              style={{
                margin: "0 0 20px",
                fontSize: "1.0625rem",
                fontWeight: 700,
              }}
            >
              Add client
            </h3>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {[
                {
                  key: "company_name",
                  placeholder: "Company name *",
                },
                {
                  key: "first_name",
                  placeholder: "First name",
                },
                {
                  key: "last_name",
                  placeholder: "Last name",
                },
                {
                  key: "email",
                  placeholder: "Email",
                },
                {
                  key: "job_title",
                  placeholder: "Job title",
                },
              ].map(({ key, placeholder }) => (
                <input
                  key={key}
                  value={(newClient as any)[key]}
                  onChange={e =>
                    setNewClient(prev => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  placeholder={placeholder}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 9,
                    border: "1px solid #E2E8F0",
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                />
              ))}
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 20,
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setShowAdd(false)}
                style={{
                  padding: "9px 18px",
                  borderRadius: 9,
                  border: "1px solid #E2E8F0",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              <button
                onClick={addClient}
                disabled={saving}
                style={{
                  padding: "9px 18px",
                  borderRadius: 9,
                  border: "none",
                  background: "#2563EB",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {saving ? "Saving…" : "Add client"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* TRIGGER SCRAPE MODAL                                  */}
      {/* ===================================================== */}

      {showTrigger && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.4)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 28,
              maxWidth: 520,
              width: "90%",
              boxShadow:
                "0 20px 60px rgba(0,0,0,.15)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.0625rem",
                  fontWeight: 700,
                }}
              >
                Trigger scrape
              </h3>

              <button
                onClick={() => {
                  setShowTrigger(false);
                  resetTriggerForm();
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#94A3B8",
                  display: "flex",
                }}
              >
                <X
                  style={{
                    width: 18,
                    height: 18,
                  }}
                />
              </button>
            </div>

            {/* Source tabs */}
            <div
              style={{
                display: "flex",
                border: "1px solid #E2E8F0",
                borderRadius: 10,
                overflow: "hidden",
                marginBottom: 20,
              }}
            >
              {(["linkedin", "indeed"] as const).map(
                src => (
                  <button
                    key={src}
                    onClick={() =>
                      setTriggerSource(src)
                    }
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      background:
                        triggerSource === src
                          ? "#EFF6FF"
                          : "#fff",
                      color:
                        triggerSource === src
                          ? "#2563EB"
                          : "#94A3B8",
                      borderBottom:
                        triggerSource === src
                          ? "2px solid #2563EB"
                          : "2px solid transparent",
                    }}
                  >
                    {src === "linkedin"
                      ? "LinkedIn"
                      : "Indeed"}
                  </button>
                )
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: 14,
                marginBottom: 14,
              }}
            >
              {/* Keyword */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#64748B",
                    marginBottom: 6,
                  }}
                >
                  Keyword *
                </label>

                <input
                  value={triggerForm.keyword}
                  onChange={e =>
                    setTriggerForm(prev => ({
                      ...prev,
                      keyword: e.target.value,
                    }))
                  }
                  placeholder="e.g. Backend Engineer"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 9,
                    border: "1px solid #E2E8F0",
                    fontSize: "0.875rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Location */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#64748B",
                    marginBottom: 6,
                  }}
                >
                  Location
                </label>

                <input
                  value={triggerForm.location}
                  onChange={e =>
                    setTriggerForm(prev => ({
                      ...prev,
                      location: e.target.value,
                    }))
                  }
                  placeholder="e.g. San Francisco"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 9,
                    border: "1px solid #E2E8F0",
                    fontSize: "0.875rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Experience */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#64748B",
                    marginBottom: 6,
                  }}
                >
                  Experience
                </label>

                <select
                  value={triggerForm.experience}
                  onChange={e =>
                    setTriggerForm(prev => ({
                      ...prev,
                      experience: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 9,
                    border: "1px solid #E2E8F0",
                    fontSize: "0.875rem",
                    outline: "none",
                    boxSizing: "border-box",
                    background: "#fff",
                  }}
                >
                  {EXPERIENCE_LEVELS.map(level => (
                    <option
                      key={level}
                      value={level}
                    >
                      {level}
                    </option>
                  ))}
                </select>
              </div>

              {/* Industry */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#64748B",
                    marginBottom: 6,
                  }}
                >
                  Industry (optional)
                </label>

                <input
                  value={triggerForm.industry}
                  onChange={e =>
                    setTriggerForm(prev => ({
                      ...prev,
                      industry: e.target.value,
                    }))
                  }
                  placeholder="e.g. FinTech"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 9,
                    border: "1px solid #E2E8F0",
                    fontSize: "0.875rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Max jobs */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#64748B",
                    marginBottom: 6,
                  }}
                >
                  Max jobs
                </label>

                <input
                  type="number"
                  min={1}
                  value={triggerForm.max_jobs}
                  onChange={e =>
                    setTriggerForm(prev => ({
                      ...prev,
                      max_jobs: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 9,
                    border: "1px solid #E2E8F0",
                    fontSize: "0.875rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Modal buttons */}
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 20,
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setShowTrigger(false);
                  resetTriggerForm();
                }}
                style={{
                  padding: "9px 18px",
                  borderRadius: 9,
                  border: "1px solid #E2E8F0",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              <button
                onClick={submitTrigger}
                disabled={triggering}
                style={{
                  padding: "9px 18px",
                  borderRadius: 9,
                  border: "none",
                  background: "#2563EB",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {triggering
                  ? "Triggering…"
                  : `Trigger ${
                      triggerSource === "linkedin"
                        ? "LinkedIn"
                        : "Indeed"
                    } scrape`}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}