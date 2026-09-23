import { GST_STATES } from '@shared/constants/gstStates';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../shared/api/restApi';
import { GenericList } from '../../shared/components/lists/genericList/GenericList';
import { CRUDPage } from '../../shared/components/layout/crudPage/CRUDPage';
import { useApiMutation, useApiQuery } from '../../shared/hooks/ayncAction/useApiCall';
import { useRefreshProfile } from '../../shared/hooks/auth/useAuthActions';
import type { Office, OfficeAdd, OfficeUpdate } from '../../shared/types/admin';
import type { Response } from '../../shared/types/response';
import { useAppSelector } from '../../state/configureStore';
import { selectAuthCompanies, selectAuthUser } from '../../state/authSlice';
import { Form } from './Form';

const fetchOffices = () => getApi().getOffices();
const addOffice = (data: OfficeAdd) => getApi().addOffice(data);
const updateOffice = (data: OfficeUpdate) => getApi().updateOffice(data);

const STATE_NAMES = new Map<string, string>(GST_STATES.map(state => [state.code, state.name]));

const useOfficesRetrieve = ({ onDone }: { onDone?: (data: Response<Office[]>) => void }) => {
  const { data, execute } = useApiQuery(fetchOffices, { onDone });
  return { items: data ?? [], execute };
};

const withProfileRefresh =
  <T,>(refresh: () => Promise<void>, onDone?: (data: Response<T>) => void) =>
  (data: Response<T>) => {
    if (data.success) refresh();
    onDone?.(data);
  };

export const OfficesPage = () => {
  const { t } = useTranslation();
  const user = useAppSelector(selectAuthUser);
  const companies = useAppSelector(selectAuthCompanies);
  const refreshProfile = useRefreshProfile();
  const companyNames = useMemo(() => new Map(companies.map(company => [company.id, company.name])), [companies]);

  const useOfficeAdd = (args: { item?: OfficeAdd; immediate?: boolean; onDone?: (data: Response<Office>) => void }) =>
    useApiMutation(addOffice, { ...args, onDone: withProfileRefresh(refreshProfile, args.onDone) });

  const useOfficeUpdate = (args: {
    item?: OfficeUpdate;
    immediate?: boolean;
    onDone?: (data: Response<Office>) => void;
  }) => useApiMutation(updateOffice, { ...args, onDone: withProfileRefresh(refreshProfile, args.onDone) });

  return (
    <CRUDPage<Office, OfficeAdd, OfficeUpdate>
      componentId="offices"
      title={t('offices.title')}
      useRetrieve={useOfficesRetrieve}
      useAdd={useOfficeAdd}
      useUpdate={useOfficeUpdate}
      searchField={office => `${office.name} ${office.code} ${office.gstin ?? ''}`}
      sortOptions={[
        { label: t('common.name'), value: 'name' },
        { label: t('offices.code'), value: 'code' }
      ]}
      showAddButton={Boolean(user?.allOffices)}
      noItemButtonText={user?.allOffices ? t('offices.add') : undefined}
      noItemText={t('offices.noItem')}
      leftTitle={t('nav.offices')}
      validateAndNormalize={async data => data as OfficeAdd | OfficeUpdate}
      renderListItem={(item, selectedItem, onEdit, onDelete) => (
        <GenericList
          key={item.id}
          item={item}
          selectedItem={selectedItem}
          showDeleteButton={false}
          onEdit={onEdit}
          onDelete={onDelete}
          getShortName={office => office.code}
          getName={office => office.name}
          getAdditional={office =>
            `${companyNames.get(office.businessId) ?? ''} · ${STATE_NAMES.get(office.stateCode) ?? office.stateCode}`
          }
          getEmail={office => office.gstin ?? t('offices.noGstin')}
          getPhone={office => office.phone ?? undefined}
          getIsArchived={office => office.isArchived}
        />
      )}
      form={({ item, onChange }) => (
        <Form
          office={item}
          companies={companies}
          handleChange={d =>
            onChange({ changedData: d.office, isFormValid: d.isFormValid, description: d.description })
          }
        />
      )}
    />
  );
};
