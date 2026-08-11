"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AvatarBuilder } from "../../avatar/AvatarBuilder";
import { copy } from "../../content/copy";
import { useAuth } from "../../state/auth-context";

export default function AvatarStudioPage() {
  const { avatarConfig, saveAvatar } = useAuth();
  const router = useRouter();

  async function saveAndReturn(config: Parameters<typeof saveAvatar>[0]) {
    await saveAvatar(config);
    router.push("/me?avatar=saved");
  }

  return (
    <div className="page page--avatar-studio">
      <Link
        className="avatar-studio__back"
        href="/me"
        aria-label={copy.avatar.back}
        title={copy.avatar.back}
      >
        <span aria-hidden="true">←</span>
      </Link>
      <AvatarBuilder config={avatarConfig} onSave={saveAndReturn} />
    </div>
  );
}
