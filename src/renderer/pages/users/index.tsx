import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { getApi } from '../../shared/api/restApi';
import { GenericList } from '../../shared/components/lists/genericList/GenericList';
import { CRUDPage } from '../../shared/components/layout/crudPage/CRUDPage';
import { useApiMutation, useApiQuery } from '../../shared/hooks/ayncAction/useApiCall';
import { useConfirm } from '../../shared/hooks/other/useConfirm';
import type { User, UserAdd, UserUpdate } from '../../shared/types/admin';
import type { Response } from '../../shared/types/response';
import { useAppDispatch, useAppSelector } from '../../state/configureStore';
import { selectAuthCompanies, selectAuthOffices } from '../../state/authSlice';
import { addToast } from '../../state/pageSlice';
import { Form } from './Form';
import { TemporaryPasswordDialog, type IssuedPassword } from './TemporaryPasswordDialog';

const fetchUsers = () => getApi().getUsers();
const fetchRoles = () => getApi().getRoles();
const fetchPermissions = () => getApi().getPermissions();
const updateUser = (data: UserUpdate) => getApi().updateUser(data);

const useUsersRetrieve = ({ onDone }: { onDone?: (data: Response<User[]>) => void }) => {
  const { data, execute } = useApiQuery(fetchUsers, { onDone });
  return { items: data ?? [], execute };
};

const useUserUpdate = (args: { item?: UserUpdate; immediate?: boolean; onDone?: (data: Response<User>) => void }) =>
  useApiMutation(updateUser, args);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const UsersPage = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const offices = useAppSelector(selectAuthOffices);
  const companies = useAppSelector(selectAuthCompanies);
  const { data: roles = [] } = useApiQuery(fetchRoles, { showLoader: false });
  const { data: groups = [] } = useApiQuery(fetchPermissions, { showLoader: false });
  const { confirm, dialog } = useConfirm();
  const [issued, setIssued] = useState<IssuedPassword | null>(null);
  const officeCodes = useMemo(() => new Map(offices.map(office => [office.id, office.code])), [offices]);

  const addUser = useCallback(async (data: UserAdd): Promise<Response<User>> => {
    const response = await getApi().addUser(data);
    if (!response.success || !response.data) return { ...response, data: undefined };
    setIssued({ name: response.data.user.fullName, password: response.data.temporaryPassword });
    return { success: true, data: response.data.user };
  }, []);

  const useUserAdd = (args: { item?: UserAdd; immediate?: boolean; onDone?: (data: Response<User>) => void }) =>
    useApiMutation(addUser, args);

  const onResetPassword = useCallback(
    async (user: User) => {
      if (!(await confirm(t('users.resetConfirm', { name: user.fullName })))) return;
      try {
        const response = await getApi().resetUserPassword(user.id);
        if (response.success && response.data) {
          setIssued({ name: user.fullName, password: response.data.temporaryPassword });
          return;
        }
        const key = response.message ?? response.key ?? 'error.unknownError';
        dispatch(addToast({ message: i18n.exists(key) ? t(key) : key, severity: 'error' }));
      } catch (error) {
        dispatch(addToast({ message: (error as Error).message, severity: 'error' }));
      }
    },
    [confirm, dispatch, t]
  );

  const describeOffices = (user: User) =>
    user.allOffices
      ? t('users.allOffices')
      : user.officeIds.map(id => officeCodes.get(id) ?? `#${id}`).join(', ') || t('users.noOffices');

  return (
    <>
      <CRUDPage<User, UserAdd, UserUpdate>
        componentId="users"
        inlineOnAdd
        title={t('users.title')}
        useRetrieve={useUsersRetrieve}
        useAdd={useUserAdd}
        useUpdate={useUserUpdate}
        searchField={user => `${user.fullName} ${user.email}`}
        sortOptions={[
          { label: t('common.name'), value: 'fullName' },
          { label: t('users.email'), value: 'email' }
        ]}
        noItemButtonText={t('users.add')}
        noItemText={t('users.noItem')}
        leftTitle={t('nav.users')}
        validateAndNormalize={async data => data as UserAdd | UserUpdate}
        renderListItem={(item, selectedItem, onEdit, onDelete) => (
          <GenericList
            key={item.id}
            item={item}
            selectedItem={selectedItem}
            showDeleteButton={false}
            onEdit={onEdit}
            onDelete={onDelete}
            getShortName={user => initials(user.fullName)}
            getName={user => user.fullName}
            getAdditional={user => `${user.roleName} · ${describeOffices(user)}`}
            getEmail={user => user.email}
            getIsArchived={user => !user.isActive}
            archivedLabel={t('users.inactive')}
          />
        )}
        form={({ item, onChange }) => (
          <Form
            user={item}
            roles={roles}
            groups={groups}
            offices={offices}
            companies={companies}
            onResetPassword={onResetPassword}
            handleChange={d =>
              onChange({ changedData: d.user, isFormValid: d.isFormValid, description: d.description })
            }
          />
        )}
      />
      <TemporaryPasswordDialog issued={issued} onClose={() => setIssued(null)} />
      {dialog}
    </>
  );
};
