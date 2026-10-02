"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { ToastMessage } from "@/components/Toast";
import { CATEGORY_LABELS, CHANGE_TYPE_LABELS } from "@/lib/policy-radar/labels";
import type {
  PolicyCategory,
  PolicyChangeType,
  PolicyPlatform,
  PolicyRadarItem,
  PolicySourceType,
} from "@/lib/policy-radar/types";

const selectClass =
  "h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-blue-400";

interface AddPolicyItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (item: PolicyRadarItem) => void;
  onToast: (msg: Omit<ToastMessage, "id">) => void;
}

const EMPTY_FORM = {
  platform: "google_ads" as PolicyPlatform,
  category: "policy" as PolicyCategory,
  changeType: "policy_update" as PolicyChangeType,
  sourceType: "official_policy" as PolicySourceType,
  title: "",
  sourceUrl: "",
  sourceLabel: "",
  official: true,
  publishedAt: "",
  summaryShort: "",
  whyItMatters: "",
  tags: "",
};

export function AddPolicyItemDialog({ open, onOpenChange, onCreated, onToast }: AddPolicyItemDialogProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const canSubmit = form.title.trim() && form.sourceUrl.trim() && form.summaryShort.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/policy-radar/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          publishedAt: form.publishedAt || null,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      const json = await res.json();
      if (json.success) {
        onToast({ title: "✅ Đã thêm mục Policy Radar" });
        onCreated(json.data);
        setForm(EMPTY_FORM);
        onOpenChange(false);
      } else {
        onToast({ title: `❌ ${json.error}`, variant: "error" });
      }
    } catch {
      onToast({ title: "❌ Lỗi kết nối API", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thêm mục Policy Radar</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Nền tảng</label>
              <select className={selectClass} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as PolicyPlatform })}>
                <option value="google_ads">Google Ads</option>
                <option value="meta">Meta</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Danh mục</label>
              <select className={selectClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PolicyCategory })}>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Loại thay đổi</label>
              <select className={selectClass} value={form.changeType} onChange={(e) => setForm({ ...form, changeType: e.target.value as PolicyChangeType })}>
                {Object.entries(CHANGE_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Ngày hiệu lực (nếu biết)</label>
              <Input type="date" value={form.publishedAt} onChange={(e) => setForm({ ...form, publishedAt: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Tiêu đề *</label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="VD: Cập nhật chính sách quảng cáo tài chính" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Link nguồn *</label>
              <Input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://support.google.com/..." />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Tên nguồn</label>
              <Input value={form.sourceLabel} onChange={(e) => setForm({ ...form, sourceLabel: e.target.value })} placeholder="VD: Google Ads Policy Help" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Checkbox checked={form.official} onCheckedChange={(c) => setForm({ ...form, official: c })} />
            Đây là nguồn chính thức (trang của Google/Meta)
          </label>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Tóm tắt ngắn *</label>
            <Textarea value={form.summaryShort} onChange={(e) => setForm({ ...form, summaryShort: e.target.value })} placeholder="1 câu, ngôn ngữ nghiệp vụ" />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Vì sao quan trọng</label>
            <Textarea value={form.whyItMatters} onChange={(e) => setForm({ ...form, whyItMatters: e.target.value })} placeholder="1-3 câu, giải thích tác động thực tế" />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Tags (phân cách bằng dấu phẩy)</label>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="ai-disclosure, targeting" />
          </div>

          <p className="text-xs text-slate-400">
            Mức độ ảnh hưởng và việc cần làm sẽ được gợi ý tự động theo danh mục — có thể chỉnh lại trong màn chi tiết sau khi tạo.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Hủy</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || saving}>{saving ? "Đang lưu..." : "Thêm mục"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
