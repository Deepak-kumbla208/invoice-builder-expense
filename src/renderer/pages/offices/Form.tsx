import { GST_STATES, GSTIN_PATTERN, gstinMatchesState } from '@shared/constants/gstStates';
import { FormControlLabel, Grid, MenuItem, Switch, TextField } from '@mui/material';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormDirtyCheck } from '../../shared/hooks/form/useFormDirtyCheck';
import type { Office, OfficeAdd, OfficeUpdate } from '../../shared/types/admin';
import type { AuthCompany } from '../../shared/types/auth';
import { validators } from '../../shared/utils/validatorFunctions';

const CODE_PATTERN = /^[A-Z0-9]{2,3}$/;

interface FormState {
  businessId: number | '';
  name: string;
  code: string;
  stateCode: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  lutReference: string;
  lutValidUntil: string;
  isArchived: boolean;
}

interface Props {
  office?: Office;
  companies: AuthCompany[];
  handleChange: (data: { office: OfficeAdd | OfficeUpdate; isFormValid: boolean; description?: string }) => void;
}

const toForm = (office?: Office): FormState => ({
  businessId: office?.businessId ?? '',
  name: office?.name ?? '',
  code: office?.code ?? '',
  stateCode: office?.stateCode ?? '',
  address: office?.address ?? '',
  phone: office?.phone ?? '',
  email: office?.email ?? '',
  gstin: office?.gstin ?? '',
  lutReference: office?.lutReference ?? '',
  lutValidUntil: office?.lutValidUntil ?? '',
  isArchived: office?.isArchived ?? false
});

const orNull = (value: string) => value.trim() || null;

export const Form: FC<Props> = ({ office, companies, handleChange }) => {
  const { t } = useTranslation();
  const initialFormRef = useRef<FormState | undefined>(undefined);
  const [form, setForm] = useState<FormState>(() => toForm(office));
  const [touched, setTouched] = useState<ReadonlySet<keyof FormState>>(new Set());

  useFormDirtyCheck(form, initialFormRef);

  useEffect(() => {
    const initial = toForm(office);
    initialFormRef.current = initial;
    setForm(initial);
    setTouched(new Set());
  }, [office]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setTouched(prev => new Set(prev).add(key));
  };

  const errors = useMemo(() => {
    const gstin = form.gstin.trim().toUpperCase();
    const lutReference = form.lutReference.trim();
    return {
      businessId: form.businessId === '',
      name: form.name.trim() === '',
      code: !CODE_PATTERN.test(form.code.trim().toUpperCase()),
      stateCode: form.stateCode === '',
      email: form.email.trim() !== '' && !validators.email(form.email.trim()),
      gstin:
        gstin !== '' &&
        (!GSTIN_PATTERN.test(gstin) || (form.stateCode !== '' && !gstinMatchesState(gstin, form.stateCode))),
      lutReference: lutReference !== '' && gstin === '',
      lutIncomplete: (lutReference === '') !== (form.lutValidUntil === '')
    };
  }, [form]);

  const output = useMemo<OfficeAdd | OfficeUpdate>(() => {
    const data: OfficeAdd = {
      businessId: Number(form.businessId),
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      stateCode: form.stateCode,
      address: orNull(form.address),
      phone: orNull(form.phone),
      email: orNull(form.email),
      gstin: orNull(form.gstin.toUpperCase()),
      lutReference: orNull(form.lutReference),
      lutValidUntil: form.lutValidUntil || null,
      isArchived: form.isArchived
    };
    return office ? { ...data, id: office.id } : data;
  }, [form, office]);

  useEffect(() => {
    handleChange({
      office: output,
      isFormValid: !Object.values(errors).some(Boolean),
      description: t('common.invalidForm')
    });
  }, [output, errors, handleChange, t]);

  const shown = (key: 'businessId' | 'name' | 'stateCode') => errors[key] && (office !== undefined || touched.has(key));

  const selectableCompanies = companies.filter(company => !company.isArchived || company.id === office?.businessId);

  return (
    <Grid container spacing={2} sx={{ pb: 2 }}>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          select
          label={t('offices.company')}
          required
          fullWidth
          value={form.businessId}
          disabled={Boolean(office)}
          onChange={event => update('businessId', Number(event.target.value))}
          error={shown('businessId')}
          helperText={office ? t('offices.companyFixed') : undefined}
        >
          {selectableCompanies.map(company => (
            <MenuItem key={company.id} value={company.id}>
              {company.name}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          label={t('offices.name')}
          required
          fullWidth
          value={form.name}
          onChange={event => update('name', event.target.value)}
          error={shown('name')}
          helperText={shown('name') ? t('common.fieldRequired') : undefined}
          slotProps={{ htmlInput: { maxLength: 200 } }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <TextField
          label={t('offices.code')}
          required
          fullWidth
          value={form.code}
          onChange={event => update('code', event.target.value.toUpperCase())}
          error={form.code !== '' && errors.code}
          helperText={t('offices.codeHelper')}
          slotProps={{ htmlInput: { maxLength: 3 } }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 8 }}>
        <TextField
          select
          label={t('offices.state')}
          required
          fullWidth
          value={form.stateCode}
          onChange={event => update('stateCode', event.target.value)}
          error={shown('stateCode')}
        >
          {GST_STATES.map(state => (
            <MenuItem key={state.code} value={state.code}>
              {state.code} · {state.name}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <TextField
          label={t('offices.gstin')}
          fullWidth
          value={form.gstin}
          onChange={event => update('gstin', event.target.value.toUpperCase())}
          error={errors.gstin}
          helperText={errors.gstin ? t('office.gstinInvalid') : t('offices.gstinHelper')}
          slotProps={{ htmlInput: { maxLength: 15 } }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          label={t('offices.lutReference')}
          fullWidth
          value={form.lutReference}
          onChange={event => update('lutReference', event.target.value)}
          error={errors.lutReference || (errors.lutIncomplete && form.lutReference.trim() === '')}
          helperText={
            errors.lutReference
              ? t('office.lutRequiresGstin')
              : errors.lutIncomplete
                ? t('office.lutIncomplete')
                : t('offices.lutHelper')
          }
          slotProps={{ htmlInput: { maxLength: 100 } }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          label={t('offices.lutValidUntil')}
          type="date"
          fullWidth
          value={form.lutValidUntil}
          onChange={event => update('lutValidUntil', event.target.value)}
          error={errors.lutIncomplete && form.lutValidUntil === ''}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <TextField
          label={t('offices.address')}
          fullWidth
          multiline
          minRows={2}
          value={form.address}
          onChange={event => update('address', event.target.value)}
          slotProps={{ htmlInput: { maxLength: 1000 } }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          label={t('offices.phone')}
          fullWidth
          value={form.phone}
          onChange={event => update('phone', event.target.value)}
          slotProps={{ htmlInput: { maxLength: 50 } }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          label={t('offices.email')}
          type="email"
          fullWidth
          value={form.email}
          onChange={event => update('email', event.target.value)}
          error={errors.email}
          helperText={errors.email ? t('common.invalidEmail') : undefined}
          slotProps={{ htmlInput: { maxLength: 254 } }}
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <FormControlLabel
          control={<Switch checked={form.isArchived} onChange={event => update('isArchived', event.target.checked)} />}
          label={t('common.archived')}
        />
      </Grid>
    </Grid>
  );
};
