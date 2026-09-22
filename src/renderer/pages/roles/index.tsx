import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../shared/api/restApi';
import { GenericList } from '../../shared/components/lists/genericList/GenericList';
import { CRUDPage } from '../../shared/components/layout/crudPage/CRUDPage';
import { useApiMutation, useApiQuery } from '../../shared/hooks/ayncAction/useApiCall';
import { useConfirm } from '../../shared/hooks/other/useConfirm';
import type { Role, RoleAdd, RoleUpdate } from '../../shared/types/admin';
import type { Response } from '../../shared/types/response';
import { Form, type RoleFormData } from './Form';

const fetchRoles = () => getApi().getRoles();
const fetchPermissions = () => getApi().getPermissions();
const addRole = (data: RoleAdd) => getApi().addRole(data);
const updateRole = (data: RoleUpdate) => getApi().updateRole(data);
const deleteRole = (id: number) => getApi().deleteRole(id);

const useRolesRetrieve = ({ onDone }: { onDone?: (data: Response<Role[]>) => void }) => {
  const { data, execute } = useApiQuery(fetchRoles, { onDone });
  return { items: data ?? [], execute };
};

const useRoleAdd = (args: { item?: RoleAdd; immediate?: boolean; onDone?: (data: Response<Role>) => void }) =>
  useApiMutation(addRole, args);

const useRoleUpdate = (args: { item?: RoleUpdate; immediate?: boolean; onDone?: (data: Response<Role>) => void }) =>
  useApiMutation(updateRole, args);

const useRoleDelete = ({
  id,
  ...args
}: {
  id: number;
  immediate?: boolean;
  onDone?: (data: Response<unknown>) => void;
}) => useApiMutation(deleteRole, { ...args, item: id === -1 ? undefined : id });

export const RolesPage = () => {
  const { t } = useTranslation();
  const { data: groups = [] } = useApiQuery(fetchPermissions, { showLoader: false });
  const { confirm, dialog } = useConfirm();

  const validateAndNormalize = useCallback(
    async (data: unknown): Promise<RoleAdd | RoleUpdate | undefined> => {
      const { id, affectedUsers, permissionsChanged, ...input } = data as RoleFormData;
      if (id !== undefined && permissionsChanged && affectedUsers > 0) {
        if (!(await confirm(t('roles.confirmAffects', { count: affectedUsers })))) return undefined;
      }
      return id === undefined ? input : { ...input, id };
    },
    [confirm, t]
  );

  return (
    <>
      <CRUDPage<Role, RoleAdd, RoleUpdate>
        componentId="roles"
        inlineOnAdd
        title={t('roles.title')}
        useRetrieve={useRolesRetrieve}
        useAdd={useRoleAdd}
        useUpdate={useRoleUpdate}
        useDelete={useRoleDelete}
        searchField="name"
        sortOptions={[{ label: t('common.name'), value: 'name' }]}
        noItemButtonText={t('roles.add')}
        noItemText={t('roles.noItem')}
        leftTitle={t('nav.roles')}
        validateAndNormalize={validateAndNormalize}
        renderListItem={(item, selectedItem, onEdit, onDelete) => (
          <GenericList
            key={item.id}
            item={item}
            selectedItem={selectedItem}
            showDeleteButton={!item.isSystem}
            onEdit={onEdit}
            onDelete={onDelete}
            getName={role => role.name}
            getAdditional={role =>
              `${t('roles.permissionCount', { count: role.permissions.length })} · ${t('roles.userCount', { count: role.affectedUsers })}`
            }
            getEmail={role => role.description ?? undefined}
            getIsArchived={role => role.isSystem}
            archivedLabel={t('roles.system')}
          />
        )}
        form={({ item, onChange }) => (
          <Form
            role={item}
            groups={groups}
            handleChange={d =>
              onChange({
                changedData: d.role as unknown as RoleAdd,
                isFormValid: d.isFormValid,
                description: d.description
              })
            }
          />
        )}
      />
      {dialog}
    </>
  );
};
