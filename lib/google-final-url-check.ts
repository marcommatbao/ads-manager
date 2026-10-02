// ============================================================
// Kiểm trang đích trước khi tạo chiến dịch
// ------------------------------------------------------------
// VÌ SAO CẦN: Google cho trình thu thập vào thử trang đích. Vào không được thì
// nó từ chối quảng cáo với chủ đề `DESTINATION_NOT_WORKING`, xếp loại
// **PROHIBITED** — cấm hẳn, không xin miễn trừ được.
//
// Và thông báo Google trả về KHÔNG nói đó là lỗi URL:
//   "The resource has been disapproved since the policy summary includes
//    policy topics of type PROHIBITED. [policy_finding_error: 2]"
// Người dùng đọc câu đó sẽ đi sửa câu chữ quảng cáo — sai hướng hoàn toàn, và
// sửa bao nhiêu lần cũng không qua.
//
// CA THẬT (19/09/2026): người dùng bấm tạo chiến dịch, bị chặn, thử lại vẫn bị
// chặn. Kiểm 11 URL trong bảng sản phẩm thì **7 cái trả 404/403**:
//   matbao.net/ten-mien · /hosting · /email-doanh-nghiep · /microsoft-365 ·
//   /ssl · matbao.in/chu-ky-so · sale.ai (403 — tên miền đang rao bán trên
//   atom.com, không phải sản phẩm của công ty)
// Trang thật của matbao.net có đuôi `.html` và cần `www.`.
//
// Tức MỌI lần tạo chiến dịch cho 7 sản phẩm đó đều hỏng, và không ai lần ra
// được nguyên nhân vì lời từ chối không nhắc gì tới URL.
//
// Kiểm ở đây rẻ hơn nhiều so với để Google từ chối: một lượt HTTP, biết ngay,
// và báo được bằng tiếng Việt kèm mã lỗi thật.
// ============================================================

export interface FinalUrlCheck {
  url: string;
  ok: boolean;
  status: number | null;
  /** Địa chỉ cuối sau khi đi hết chuyển hướng — nơi Google thật sự nhìn thấy. */
  finalUrl?: string;
  /** Câu giải thích bằng tiếng Việt, đã gồm việc cần làm. */
  problem?: string;
}

/**
 * Mở thử trang đích, đi theo chuyển hướng như trình thu thập của Google.
 *
 * KHÔNG ném lỗi: hỏng mạng phía mình không được biến thành chặn người dùng tạo
 * chiến dịch. Không kiểm được thì trả `ok: true` kèm ghi chú — thà để lọt một
 * ca còn hơn chặn oan một ca hợp lệ vì mạng của máy chủ chập chờn.
 */
export async function checkFinalUrl(url: string, timeoutMs = 12_000): Promise<FinalUrlCheck> {
  const clean = (url ?? "").trim();
  if (!clean) {
    return { url: clean, ok: false, status: null,
      problem: "Sản phẩm này chưa có trang đích. Google bắt buộc mỗi quảng cáo phải trỏ tới một trang mở được — không có URL thì không tạo được chiến dịch." };
  }
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return { url: clean, ok: false, status: null, problem: `"${clean}" không phải một địa chỉ web hợp lệ.` };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { url: clean, ok: false, status: null, problem: `"${clean}" phải bắt đầu bằng http:// hoặc https://.` };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // GET chứ không HEAD: nhiều máy chủ trả 405 cho HEAD trong khi trang vẫn
    // mở bình thường — dùng HEAD sẽ báo hỏng oan. Trình thu thập của Google
    // cũng dùng GET.
    const res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AdsCommand-LinkCheck/1.0)" },
    });
    const finalUrl = res.url || parsed.toString();
    if (res.ok) return { url: clean, ok: true, status: res.status, finalUrl };

    return {
      url: clean,
      ok: false,
      status: res.status,
      finalUrl,
      problem: res.status === 404
        ? `Trang đích trả lỗi 404 — không tồn tại${finalUrl !== clean ? ` (sau chuyển hướng tới ${finalUrl})` : ""}. Google sẽ từ chối quảng cáo với lý do DESTINATION_NOT_WORKING.`
        : `Trang đích trả mã ${res.status}${finalUrl !== clean ? ` (sau chuyển hướng tới ${finalUrl})` : ""}. Google cần mở được trang này thì mới duyệt quảng cáo.`,
    };
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      const code = String((e as { cause?: { code?: string } })?.cause?.code ?? "");

      // ── Lỗi CỦA TRANG ĐÍCH, không phải của mạng phía mình ──────────────
      //
      // Đo thật 24/09: `https://www.mifi.vn/` ném `fetch failed` với
      // `cause.code = ERR_SSL_SSL/TLS_ALERT_HANDSHAKE_FAILURE`. Chứng chỉ chỉ
      // cấp cho `mifi.vn`, KHÔNG có `www.mifi.vn`, nên máy chủ từ chối bắt tay
      // TLS. Google xếp đúng loại này là DESTINATION_NOT_WORKING — cùng thời
      // điểm đo, tài khoản MBI có 48 quảng cáo bị từ chối vì lý do đó.
      //
      // Bản cũ gộp MỌI lỗi kết nối vào "chưa chắc trang hỏng", nên tool GIẤU
      // mất đúng cái hỏng nặng nhất. Chứng chỉ hỏng / tên miền không phân giải
      // / máy chủ từ chối kết nối là hỏng THẬT và tái hiện được từ mọi nơi,
      // khác hẳn một lượt hết giờ.
      const destinationBroken =
        code.includes("SSL") || code.includes("TLS") ||
        code === "EPROTO" || code === "ENOTFOUND" || code === "ECONNREFUSED" ||
        code === "CERT_HAS_EXPIRED" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
        code === "DEPTH_ZERO_SELF_SIGNED_CERT";

      if (destinationBroken) {
        const why =
          code.includes("SSL") || code.includes("TLS") || code === "EPROTO"
            ? "chứng chỉ HTTPS không dùng được (máy chủ từ chối bắt tay TLS)"
            : code === "ENOTFOUND" ? "tên miền không phân giải được"
            : code === "ECONNREFUSED" ? "máy chủ từ chối kết nối"
            : "lỗi kết nối " + code;
        return {
          url: clean,
          ok: false,
          status: null,
          problem: "Trang đích KHÔNG mở được — " + why +
            ". Google sẽ từ chối quảng cáo với lý do DESTINATION_NOT_WORKING. " +
            "Kiểm tra tên miền: bản có www. và bản không có www. là HAI tên miền khác nhau, " +
            "chứng chỉ có thể chỉ cấp cho một trong hai.",
        };
      }

      return {
        url: clean,
        ok: true, // KHÔNG chặn vì lỗi phía mình — xem chú thích ở đầu hàm.
        status: null,
        problem: aborted
          ? `Không mở được trang đích trong ${Math.round(timeoutMs / 1000)} giây từ máy chủ — có thể do mạng phía tool, chưa chắc trang hỏng. Tự mở thử trước khi tạo.`
          : `Không kết nối được tới trang đích từ máy chủ (${e instanceof Error ? e.message : "lỗi không rõ"}) — chưa chắc trang hỏng. Tự mở thử trước khi tạo.`,
      };
  }
}
