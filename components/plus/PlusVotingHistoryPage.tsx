import { Box } from "@chakra-ui/layout";
import { Trans } from "@lingui/macro";
import { PlusRegion } from "@prisma/client";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "components/common/Table";
import UserAvatar from "components/common/UserAvatar";
import { FiCheck } from "react-icons/fi";
import { getFullUsername, getLocalizedMonthYearString } from "lib/strings";
import {
  VotingSummariesByMonthAndTier,
  DistinctSummaryMonths,
} from "../../services/plus";
import { Select } from "@chakra-ui/select";
import { useRouter } from "next/router";
import { chakra } from "@chakra-ui/system";

export interface PlusVotingHistoryPageProps {
  summaries: VotingSummariesByMonthAndTier;
  monthsWithData: DistinctSummaryMonths;
}

const PlusVotingHistoryPage = ({
  summaries,
  monthsWithData,
}: PlusVotingHistoryPageProps) => {
  const router = useRouter();
  return (
    <>
      <Select
        onChange={(e) => {
          router.replace(`/plus/history/${e.target.value}`);
        }}
        maxW={64}
        mb={8}
        data-cy="tier-selector"
      >
        {monthsWithData.map(({ month, year, tier }) => (
          <option
            key={`${month}${year}${tier}`}
            value={`${tier}/${year}/${month}`}
          >
            +{tier} - {getLocalizedMonthYearString(month, year, "en")}
          </option>
        ))}
      </Select>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader />
            <TableHeader>
              <Trans>Name</Trans>
            </TableHeader>
            <TableHeader>
              <Trans>Percentage</Trans>
            </TableHeader>
            <TableHeader>
              <Trans>Count (NA)</Trans>
            </TableHeader>
            <TableHeader>
              <Trans>Count (EU)</Trans>
            </TableHeader>
            <TableHeader>
              <Trans>Region</Trans>
            </TableHeader>
            <TableHeader>
              <Trans>Suggested</Trans>
            </TableHeader>
            <TableHeader>
              <Trans>Vouched</Trans>
            </TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {summaries.map((summary) => {
            const getCount = (region: PlusRegion, counts: number[]) => {
              if (region === summary.regionForVoting) return counts;

              return counts.slice(1, 3);
            };
            return (
              <TableRow key={summary.user.id}>
                <TableCell>
                  <UserAvatar user={summary.user} />
                </TableCell>
                <TableCell>{getFullUsername(summary.user)}</TableCell>
                <TableCell
                  color={summary.percentage >= 50 ? "green.500" : "red.500"}
                >
                  {summary.percentage}%
                </TableCell>
                <TableCell>
                  {getCount("NA", summary.countsNA).map((count, i, arr) => (
                    <>
                      <chakra.span
                        color={
                          i + 1 <= arr.length / 2 ? "red.500" : "green.500"
                        }
                      >
                        {count}
                      </chakra.span>
                      {i !== arr.length - 1 && <>/</>}
                    </>
                  ))}
                </TableCell>
                <TableCell>
                  {getCount("EU", summary.countsNA).map((count, i, arr) => (
                    <>
                      <chakra.span
                        color={
                          i + 1 <= arr.length / 2 ? "red.500" : "green.500"
                        }
                      >
                        {count}
                      </chakra.span>
                      {i !== arr.length - 1 && <>/</>}
                    </>
                  ))}
                </TableCell>
                <TableCell>{summary.regionForVoting}</TableCell>
                <TableCell>
                  {summary.wasSuggested && (
                    <Box mx="auto" fontSize="xl" as={FiCheck} />
                  )}
                </TableCell>
                <TableCell>
                  {summary.wasVouched && (
                    <Box mx="auto" fontSize="xl" as={FiCheck} />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
};

export default PlusVotingHistoryPage;