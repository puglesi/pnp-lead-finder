export interface AgentTwoExecutionGuard {
  begin(): boolean;
  end(): void;
  isActive(): boolean;
}

export function createAgentTwoExecutionGuard(): AgentTwoExecutionGuard {
  let active = false;
  return {
    begin: () => {
      if (active) return false;
      active = true;
      return true;
    },
    end: () => {
      active = false;
    },
    isActive: () => active,
  };
}
