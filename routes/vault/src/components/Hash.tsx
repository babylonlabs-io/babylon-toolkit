/**
 * Hash component with copy functionality
 * Similar to simple-staking's Hash component
 */

import { useState, useEffect } from "react";
import { FiCopy } from "react-icons/fi";
import { IoIosCheckmarkCircle } from "react-icons/io";
import { useCopyToClipboard } from "usehooks-ts";
import { trim } from "../utils/trim";

export function Hash({ value, symbols = 8 }: { value: string; symbols?: number }) {
  const [, copy] = useCopyToClipboard();
  const [copiedText, setCopiedText] = useState("");

  const handleCopy = () => {
    if (!value) return;
    setCopiedText("Copied!");
    copy(value);
  };

  useEffect(() => {
    if (copiedText) {
      const timer = setTimeout(() => {
        setCopiedText("");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedText]);

  if (!value) {
    return <span>-</span>;
  }

  return (
    <div
      className="inline-flex min-h-[25px] cursor-pointer items-center text-accent-primary opacity-50 hover:opacity-100"
      onClick={handleCopy}
    >
      <span className="font-mono">
        {copiedText ? copiedText : trim(value, symbols)}
      </span>
      {copiedText ? (
        <IoIosCheckmarkCircle className="ml-1" />
      ) : (
        <FiCopy className="ml-1" />
      )}
    </div>
  );
}
