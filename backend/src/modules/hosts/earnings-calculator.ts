import { GuestSession, Transaction, TransactionStatus, SessionStatus } from '@prisma/client';

/**
 * Pure, testable earnings calculation logic.
 * No side effects, no DB dependencies.
 * Used by HostsService for dashboard and potentially for updating totals.
 */
export class EarningsCalculator {
  /**
   * Determines if a session qualifies for host earnings.
   * - Must be COMPLETED
   * - Must have at least one SUCCESS transaction
   * - Must NOT have any REFUNDED transaction
   */
  static isSessionQualifyingForEarnings(
    session: Pick<GuestSession, 'status'> & { transactions?: Pick<Transaction, 'status'>[] },
  ): boolean {
    if (!session || session.status !== SessionStatus.COMPLETED) {
      return false;
    }

    const transactions = session.transactions || [];
    if (transactions.length === 0) {
      return false;
    }

    const hasSuccessfulPayment = transactions.some(
      (tx) => tx.status === TransactionStatus.SUCCESS,
    );
    const hasRefund = transactions.some(
      (tx) => tx.status === TransactionStatus.REFUNDED,
    );

    return hasSuccessfulPayment && !hasRefund;
  }

  /**
   * Calculate host's share for a single session's amountPaid.
   * sharePercentage is e.g. 25 or 55 (not 0.25).
   */
  static calculateEarningsForSession(
    amountPaid: number | string | { toNumber?: () => number },
    sharePercentage: number,
  ): number {
    let amount: number;
    if (typeof amountPaid === 'object' && amountPaid && typeof amountPaid.toNumber === 'function') {
      amount = amountPaid.toNumber();
    } else if (typeof amountPaid === 'string') {
      amount = parseFloat(amountPaid);
    } else {
      amount = amountPaid as number;
    }

    if (isNaN(amount) || amount < 0) amount = 0;
    if (isNaN(sharePercentage) || sharePercentage < 0) sharePercentage = 0;

    const rate = sharePercentage / 100;
    return Math.round(amount * rate * 100) / 100; // 2 decimal places
  }

  /**
   * Calculate earnings summary from a list of sessions.
   * Breaks down into total, today, thisMonth.
   */
  static calculateSummary(
    sessions: Array<
      Pick<GuestSession, 'status' | 'amountPaid' | 'purchasedAt'> & {
        transactions?: Pick<Transaction, 'status'>[];
      }
    >,
    sharePercentage: number,
    referenceDate: Date = new Date(),
  ): { total: number; today: number; thisMonth: number } {
    let total = 0;
    let today = 0;
    let thisMonth = 0;

    const now = referenceDate;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    for (const session of sessions) {
      if (!this.isSessionQualifyingForEarnings(session)) {
        continue;
      }

      const earned = this.calculateEarningsForSession(session.amountPaid, sharePercentage);
      total += earned;

      const purchasedDate = session.purchasedAt ? new Date(session.purchasedAt) : null;
      if (purchasedDate) {
        if (purchasedDate >= todayStart) {
          today += earned;
        }
        if (purchasedDate >= monthStart) {
          thisMonth += earned;
        }
      }
    }

    return {
      total: Math.round(total * 100) / 100,
      today: Math.round(today * 100) / 100,
      thisMonth: Math.round(thisMonth * 100) / 100,
    };
  }
}
