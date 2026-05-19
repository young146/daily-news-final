export const runtime = "nodejs";

export async function POST(request) {
  const { groupIds, message, imageUrls, userToken } = await request.json();

  if (!userToken || !groupIds?.length || !imageUrls?.length) {
    return Response.json({ ok: false, error: "groupIds, imageUrls, userToken 필요" }, { status: 400 });
  }

  const results = [];

  for (const groupId of groupIds) {
    try {
      // 이미지를 그룹에 unpublished로 업로드
      const photoIds = [];
      for (const imageUrl of imageUrls) {
        const imgRes = await fetch(imageUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!imgRes.ok) { console.warn(`이미지 다운로드 실패: ${imageUrl}`); continue; }
        const imgBuf = await imgRes.arrayBuffer();

        const form = new FormData();
        form.append("source", new Blob([imgBuf], { type: "image/jpeg" }), "card.jpg");
        form.append("published", "false");
        form.append("access_token", userToken);

        const photoRes = await fetch(`https://graph.facebook.com/v25.0/${groupId}/photos`, {
          method: "POST",
          body: form,
        });
        const photoData = await photoRes.json();
        if (photoData.id) photoIds.push(photoData.id);
        else console.error(`[FBGroup] 사진 업로드 실패 [${groupId}]:`, photoData);
      }

      // 피드에 앨범으로 게시
      const feedRes = await fetch(`https://graph.facebook.com/v25.0/${groupId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          ...(photoIds.length > 0 ? { attached_media: photoIds.map(id => ({ media_fbid: id })) } : {}),
          access_token: userToken,
        }),
      });
      const feedData = await feedRes.json();

      if (feedData.error) {
        results.push({ groupId, ok: false, error: feedData.error.message });
      } else {
        results.push({ groupId, ok: true, postId: feedData.id });
      }
    } catch (e) {
      results.push({ groupId, ok: false, error: e.message });
    }
  }

  return Response.json({ ok: results.some(r => r.ok), results });
}
