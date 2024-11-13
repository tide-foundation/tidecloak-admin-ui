import React from 'react';
import { Table, Thead, Tbody, Tr, Th, Td, TableText } from '@patternfly/react-table';
import { ClipboardCopy, ClipboardCopyVariant } from '@patternfly/react-core';
// TIDECLOAK IMPLEMENTATION
export interface LicenseData {
    license: string;
    status: string;
    date: string;
}

type TideLicenseHistoryProps = {
    licenseData: LicenseData[]
  };

export const TideLicenseHistory: React.FC<TideLicenseHistoryProps> = ({licenseData}) => {
    return (
        <Table variant={"compact"} borders={true}>
            <Thead>
                <Tr>
                    <Th>License</Th>
                    <Th>Status</Th>
                    <Th>Date</Th>
                </Tr>
            </Thead>
            <Tbody>
                {licenseData.map((licenseData, index) => (
                    <Tr key={index}>
                        <Td width={50}>
                            <TableText wrapModifier="truncate">
                            <ClipboardCopy 
                            isCode 
                            isReadOnly 
                            hoverTip="Copy to clipboard" 
                            clickTip="Copied!" 
                            variant={ClipboardCopyVariant.inline} // This keeps it inline and fits well in the table cell
                            >
                            {licenseData.license}
                            </ClipboardCopy>
                            </TableText>
                        </Td>
                        <Td>{licenseData.status}</Td>
                        <Td>{licenseData.date}</Td>
                    </Tr>
                ))}
            </Tbody>
        </Table>
    );
};
