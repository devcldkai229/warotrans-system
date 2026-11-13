import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { getOperatingContext } from '../../shared/api/operatingContextApi';
import { canReadVouchers, selectPublishedVoucherWarehouse } from './stockVoucherData';

export function useVoucherWarehouse(pinRequestedWarehouse = false) {
  const { session } = useAuth();
  const { params } = useNavigation();
  const allowed = canReadVouchers(session);
  const query = useQuery({
    queryKey: ['operating-context'],
    queryFn: () => getOperatingContext(),
    enabled: allowed,
    staleTime: 0,
    refetchInterval: 30_000,
    retry: false,
  });
  const requestedId = typeof params?.warehouseId === 'string' ? params.warehouseId : '';
  const published = allowed && !query.isError ? query.data : undefined;
  const warehouse = selectPublishedVoucherWarehouse(published, pinRequestedWarehouse ? requestedId : '');
  const selectionError = pinRequestedWarehouse && requestedId && published && !warehouse
    ? 'The published warehouse has changed. Return to Stock Vouchers before creating a new draft.' : null;
  return { session, allowed, query, warehouse, selectionError };
}
