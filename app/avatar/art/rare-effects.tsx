import type { ReactNode } from "react";

export const RARE_EFFECT_ART: Record<string, ReactNode> = {
  aurora: (
    <g className="avatar-effect avatar-effect--animated avatar-effect--aurora">
      <path
        d="M-4 14Q14 3 34 13T68 8"
        fill="none"
        stroke="#77f7d4"
        strokeWidth="5"
        opacity="0.38"
      />
      <path
        d="M-5 19Q16 7 35 18T69 13"
        fill="none"
        stroke="#8bd8ff"
        strokeWidth="4"
        opacity="0.42"
      />
      <path
        d="M-4 24Q12 13 33 22T68 19"
        fill="none"
        stroke="#d49cff"
        strokeWidth="3"
        opacity="0.46"
      />
      <path
        d="M-2 29Q17 20 36 28T66 25"
        fill="none"
        stroke="#fff1a8"
        strokeWidth="1.8"
        opacity="0.58"
      />
      <circle cx="8" cy="8" r="1.2" fill="white" />
      <circle cx="23" cy="19" r="1" fill="#fff6b5" />
      <circle cx="45" cy="7" r="1.4" fill="white" />
      <circle cx="56" cy="22" r="1" fill="#c8ffff" />
      <ellipse cx="32" cy="61" rx="25" ry="5" fill="#8bf4e4" opacity="0.1" />
    </g>
  ),
  "meteor-shower": (
    <g className="avatar-effect avatar-effect--animated avatar-effect--meteor-shower">
      <path
        d="M4 21 18 7"
        stroke="#a6eaff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M40 20 56 4"
        stroke="#d7b1ff"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M47 39 61 25"
        stroke="#fff0a6"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7 52 19 40"
        stroke="#8dffd5"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="18" cy="7" r="3" fill="#e8fbff" />
      <circle cx="56" cy="4" r="3.5" fill="#f1dfff" />
      <circle cx="61" cy="25" r="2.6" fill="#fff4bd" />
      <circle cx="19" cy="40" r="2.4" fill="#c8ffe8" />
      <circle cx="31" cy="10" r="1.1" fill="white" />
      <circle cx="54" cy="53" r="1.3" fill="white" />
      <circle cx="10" cy="33" r="1" fill="#fff0a6" />
      <path
        d="m31 25 1.3 2.8 3 .4-2.2 2.1.6 3-2.7-1.5-2.7 1.5.6-3-2.2-2.1 3-.4z"
        fill="#fff7c7"
      />
    </g>
  ),
};
