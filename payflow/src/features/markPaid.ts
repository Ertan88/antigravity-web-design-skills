import { Dispatch } from 'react';
import { Alert } from 'react-native';
import { AppState, ME } from '../core/model';
import { Action } from '../store/reducer';

/**
 * Faturayı ödendi işaretle. Ev bütçesiyle paylaşılan faturada üyeler varsa
 * "Kim ödedi?" diye sorar (ev bütçesi dengesi için).
 */
export function markBillPaid(state: AppState, dispatch: Dispatch<Action>, billId: string, period: string) {
  const bill = state.bills.find((b) => b.id === billId);
  const members = state.settings.household?.members ?? [];
  if (!bill?.shared || members.length === 0) {
    dispatch({ type: 'bill/markPaid', id: billId, period, paidBy: bill?.shared ? ME : undefined });
    return;
  }
  Alert.alert('Kim ödedi?', bill.title, [
    ...[ME, ...members].map((name) => ({ text: name, onPress: () => dispatch({ type: 'bill/markPaid', id: billId, period, paidBy: name }) })),
    { text: 'Vazgeç', style: 'cancel' as const },
  ]);
}
