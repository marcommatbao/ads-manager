"use client";

import { useState, useRef, useEffect } from "react";

export interface DraftMeta {
  id: string;
  name: string;
  currentStep: number;
  updatedAt: string;
  expiresAt: string;
  step1Data?: string | null;
  step2Data?: string | null;
  step3Data?: string | null;
  step4Data?: string | null;
  status: string;
  company: string;
}

export function useCreativeAIDraft(company: string) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SESSION_KEY = `creative_draft_${company}`;

  async function initDraft(): Promise<DraftMeta | null> {
    // Check session first
    try {
      const cached = sessionStorage.getItem(SESSION_KEY);
      if (cached) {
        const { id } = JSON.parse(cached) as { id: string };
        // Verify draft still exists
        const res = await fetch(`/api/creative-ai/drafts?id=${id}&company=${company}`);
        if (res.ok) {
          const data = await res.json() as { draft?: DraftMeta };
          if (data.draft) {
            setDraftId(id);
            setDraftName(data.draft.name);
            return data.draft;
          }
        }
      }
    } catch { /* ignore */ }

    // Create new draft
    try {
      const res = await fetch("/api/creative-ai/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company }),
      });
      if (!res.ok) return null;
      const { draft } = await res.json() as { draft: DraftMeta };
      setDraftId(draft.id);
      setDraftName(draft.name);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: draft.id }));
      return draft;
    } catch {
      return null;
    }
  }

  function autoSave(currentStep: number, stepKey: string, stepData: unknown) {
    setSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      if (!draftId) return;
      setSaveStatus("saving");
      try {
        await fetch("/api/creative-ai/drafts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: draftId, currentStep, stepKey, stepData }),
        });
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    }, 800);
  }

  async function renameDraft(name: string) {
    if (!draftId) return;
    setDraftName(name);
    await fetch("/api/creative-ai/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draftId, name }),
    });
  }

  async function markLaunched() {
    if (!draftId) return;
    await fetch("/api/creative-ai/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draftId, status: "LAUNCHED" }),
    });
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }

  async function deleteDraft(id?: string) {
    const target = id ?? draftId;
    if (!target) return;
    await fetch("/api/creative-ai/drafts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: target }),
    });
    if (!id) {
      try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    }
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return { draftId, draftName, saveStatus, initDraft, autoSave, renameDraft, markLaunched, deleteDraft };
}
