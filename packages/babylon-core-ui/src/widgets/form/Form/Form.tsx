import { type PropsWithChildren, useEffect, HTMLProps, forwardRef, useImperativeHandle } from "react";
import {
  type DefaultValues,
  type Mode,
  type SubmitHandler,
  type DeepPartial,
  FormProvider,
  useForm,
  Resolver,
  UseFormReturn,
} from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { type ObjectSchema } from "yup";
import { twJoin } from "tailwind-merge";

export interface FormProps<V extends object> extends PropsWithChildren {
  className?: string;
  name?: string;
  mode?: Mode;
  reValidateMode?: Exclude<Mode, "onTouched" | "all">;
  defaultValues?: DefaultValues<V>;
  schema?: ObjectSchema<V>;
  formProps?: HTMLProps<HTMLFormElement>;
  onSubmit?: SubmitHandler<V>;
  onChange?: (data: DeepPartial<V>) => void;
}

export type FormRef<V extends object> = UseFormReturn<V>;

function FormInner<V extends object>({
  className,
  name,
  children,
  mode = "onBlur",
  reValidateMode = "onBlur",
  defaultValues,
  schema,
  formProps,
  onSubmit = () => null,
  onChange,
}: FormProps<V>, ref: React.Ref<FormRef<V>>) {
  const methods = useForm({
    mode,
    reValidateMode,
    defaultValues,
    resolver: schema ? (yupResolver(schema) as unknown as Resolver<V>) : undefined,
  });

  /**
   * Expose the react-hook-form methods to parent components via ref.
   * This allows parent components to imperatively control the form,
   * such as programmatically setting field values (e.g., prefilling co-staking amount).
   *
   * Example usage in parent:
   *   const formRef = useRef<FormRef<MyFormFields>>(null);
   *   formRef.current?.setValue("amount", "100");
   */
  useImperativeHandle(ref, () => methods, [methods]);

  useEffect(() => {
    if (!onChange) return;

    const { unsubscribe } = methods.watch(onChange);

    return unsubscribe;
  }, [onChange, methods.watch]);

  return (
    <FormProvider {...methods}>
      <form
        className={twJoin("bbn-form", className)}
        name={name}
        onSubmit={methods.handleSubmit(onSubmit)}
        {...formProps}
      >
        {children}
      </form>
    </FormProvider>
  );
}

export const Form = forwardRef(FormInner) as <V extends object>(
  props: FormProps<V> & { ref?: React.Ref<FormRef<V>> }
) => ReturnType<typeof FormInner>;
