'use client';

import { ChatPanel } from '../../components/ChatPanel';
import { AuditPanel } from '../../components/AuditPanel';

export default function Demo() {
  return (
    <div className="main-grid">
      <ChatPanel />
      <AuditPanel />
    </div>
  );
}
