"use client";

import Link from "next/link";
import { AvatarBuilder } from "../../avatar/AvatarBuilder";
import { copy } from "../../content/copy";
import { useAuth } from "../../state/auth-context";

export default function AvatarStudioPage() {
  const { avatarConfig, saveAvatar } = useAuth();

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
      <AvatarBuilder config={avatarConfig} onSave={saveAvatar} />
    </div>
  );
}
