import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { canReadVouchers, loadVoucherWarehouses, selectVoucherWarehouse } from './stockVoucherData';

export function useVoucherWarehouse() {
  const { session } = useAuth();
  const { params } = useNavigation();
  const allowed = canReadVouchers(session);
  const query = useQuery({
    queryKey: ['voucher-warehouses', session?.id],
    queryFn: ({ signal }) => loadVoucherWarehouses(signal),
    enabled: allowed,
    staleTime: 0,
    retry: false,
  });
  const requestedId = typeof params?.warehouseId === 'string' ? params.warehouseId : '';
  const warehouses = query.data || [];
  const warehouse = selectVoucherWarehouse(warehouses, requestedId);
  const selectionError = requestedId && query.data && !warehouse ? 'This warehouse is no longer available.' : null;
  return { session, allowed, query, warehouse, warehouses, selectionError };
}
