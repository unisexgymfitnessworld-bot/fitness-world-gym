import { useEffect, useMemo, useState } from "react";
import { api, isApiConfigured } from "../lib/api";
import { sampleAttendance, sampleMembers } from "../lib/sampleData";
import { toMember } from "../lib/utils";
import type { AttendanceEntry, DashboardStats, Member, MemberInput } from "../types";

interface MembersState {
  members: Member[];
  attendance: AttendanceEntry[];
  stats: DashboardStats;
  loading: boolean;
  upsertMember: (input: MemberInput, memberId?: string) => Promise<Member>;
  suspendMember: (memberId: string) => Promise<void>;
  renewMember: (memberId: string, start: string, due: string, feesAmount: number) => Promise<void>;
  addVisit: (memberId: string, visitDate: string, weightKg?: number) => Promise<void>;
  markSmsSent: (memberId: string) => Promise<void>;
}

export function useMembers(): MembersState {
  const [members, setMembers] = useState<Member[]>(isApiConfigured ? [] : sampleMembers);
  const [attendance, setAttendance] = useState<AttendanceEntry[]>(isApiConfigured ? [] : sampleAttendance);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isApiConfigured) {
      let cancelled = false;
      async function loadLiveData(): Promise<void> {
        setLoading(true);
        try {
          const liveMembers = await api.members();
          const liveAttendance = await Promise.all(liveMembers.map((member) => api.attendance(member.id)));
          if (!cancelled) {
            setMembers(liveMembers);
            setAttendance(liveAttendance.flat());
          }
        } catch (error) {
          console.error("Unable to load live member data", error);
          if (!cancelled) {
            setMembers(sampleMembers);
            setAttendance(sampleAttendance);
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      }
      void loadLiveData();
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(() => setLoading(false), 280);
    return () => window.clearTimeout(timer);
  }, []);

  const stats = useMemo<DashboardStats>(() => {
    const dueThisWeek = members.filter((member) => {
      const due = new Date(member.membershipDue);
      const now = new Date();
      const diff = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
      return member.status === "Active" && diff >= 0 && diff <= 7;
    }).length;

    return {
      total: members.length,
      active: members.filter((member) => member.status === "Active").length,
      dueThisWeek,
      pendingPayments: members.filter((member) => member.paymentStatus === "Pending").length,
    };
  }, [members]);

  async function upsertMember(input: MemberInput, memberId?: string): Promise<Member> {
    if (isApiConfigured) {
      const savedMember = memberId ? await api.updateMember(memberId, input) : await api.createMember(input);
      setMembers((current) => (memberId ? current.map((member) => (member.id === memberId ? savedMember : member)) : [savedMember, ...current]));
      return savedMember;
    }

    let savedMember: Member;
    setMembers((current) => {
      if (!memberId) {
        savedMember = toMember(input, current);
        return [savedMember, ...current];
      }

      const existing = current.find((member) => member.id === memberId);
      if (!existing) {
        savedMember = toMember(input, current);
        return [savedMember, ...current];
      }

      savedMember = {
        ...existing,
        ...input,
        bmi: toMember(input, current).bmi,
        smsSent3days: existing.membershipDue === input.membershipDue ? existing.smsSent3days : false,
        updatedAt: new Date().toISOString(),
      };
      return current.map((member) => (member.id === memberId ? savedMember : member));
    });
    return savedMember!;
  }

  async function suspendMember(memberId: string): Promise<void> {
    if (isApiConfigured) {
      const suspended = await api.suspendMember(memberId);
      setMembers((current) => current.map((member) => (member.id === memberId ? suspended : member)));
      return;
    }

    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              status: "Suspended",
              updatedAt: new Date().toISOString(),
            }
          : member,
      ),
    );
  }

  async function renewMember(memberId: string, start: string, due: string, feesAmount: number): Promise<void> {
    if (isApiConfigured) {
      const renewed = await api.renewMember(memberId, start, due, feesAmount);
      setMembers((current) => current.map((member) => (member.id === memberId ? renewed : member)));
      return;
    }

    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              membershipStart: start,
              membershipDue: due,
              feesAmount,
              paymentStatus: "Paid",
              status: "Active",
              smsSent3days: false,
              updatedAt: new Date().toISOString(),
            }
          : member,
      ),
    );
  }

  async function addVisit(memberId: string, visitDate: string, weightKg?: number): Promise<void> {
    const visit = isApiConfigured
      ? await api.createAttendance(memberId, visitDate, weightKg)
      : {
          id: crypto.randomUUID(),
          memberId,
          visitDate,
          weightKg,
          createdAt: new Date().toISOString(),
        };
    setAttendance((current) => [visit, ...current]);
  }

  async function markSmsSent(memberId: string): Promise<void> {
    setMembers((current) =>
      current.map((member) => (member.id === memberId ? { ...member, smsSent3days: true, updatedAt: new Date().toISOString() } : member)),
    );
  }

  return {
    members,
    attendance,
    stats,
    loading,
    upsertMember,
    suspendMember,
    renewMember,
    addVisit,
    markSmsSent,
  };
}
